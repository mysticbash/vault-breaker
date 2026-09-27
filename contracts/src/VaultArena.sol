// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title VaultArena
 * @notice Human-vs-AI bounty game on Monad testnet.
 *
 * Flow:
 *  1. Owner (AI agent provider) registers an agent: only the salted keccak256
 *     hash of the agent's secret key goes on-chain. Plaintext never touches chain.
 *  2. Owner seeds the agent prize pool with MON.
 *  3. Attacker buys attempts (1-3 per agent, per wallet) — a real wallet tx
 *     paying attemptFee each. Failed attempts GROW the pool.
 *  4. Attacker submits the plaintext key; the contract hashes + verifies it.
 *  5. Correct key -> entire pool pays out to the attacker, agent defeated,
 *     attacker earns a Cracked badge. Wrong key -> pool grows, agent survival
 *     streak climbs, provider earns Survived badges.
 *  6. All stats on-chain => badges/status are provable.
 */
contract VaultArena {
    // ------------------------------------------------------------ errors
    error NotOwner();
    error UnknownAgent();
    error AgentDefeated();
    error NoAttemptsLeft();
    error WrongFee();
    error EmptyString();
    error TransferFailed();
    error NothingToWithdraw();
    error BadPack();
    error KeyAlreadyUsed();
    error UnknownBadge();

    // ------------------------------------------------------------ events
    event AgentRegistered(uint256 indexed agentId, string codename, string artSeed, uint256 seedPool, bytes32 keyHash);
    event PoolSeeded(uint256 indexed agentId, address indexed funder, uint256 amount, uint256 newPool);
    event AttemptBought(uint256 indexed agentId, address indexed attacker, uint256 packCount, uint256 price, uint256 newPool);
    event AttemptFailed(uint256 indexed agentId, address indexed attacker, uint256 attemptNumber, uint256 poolAfter, uint256 streak);
    event VaultCracked(uint256 indexed agentId, address indexed attacker, uint256 payout, uint256 attemptsUsed);
    event BadgeEarned(address indexed player, uint8 indexed kind, uint256 level);
    event FeeChanged(uint256 oldFee, uint256 newFee);
    event Withdrawn(address indexed to, uint256 amount);

    // ------------------------------------------------------------ types
    enum BadgeKind {
        Cracked,   // attacker badge level = lifetime vaults cracked
        Survived   // defender badge level = lifetime raids survived by provider's agents
    }

    struct Agent {
        string codename;
        string artSeed;       // game-art hint for UI
        address provider;
        bytes32 salt;         // per-agent salt for key hashing
        bytes32 keyHash;      // keccak256(abi.encodePacked(salt, normalize(key)))
        uint256 pool;         // prize pool in wei
        bool active;          // false once cracked
        bool exists;
        uint256 survivalStreak;   // consecutive full-raid survivals
        uint256 totalSurvivals;   // lifetime survived raids
        uint256 totalAttempts;    // every attempt ever made against it
        uint256 crackedAt;        // timestamp (0 while alive)
        address crackedBy;        // winner (zero while alive)
    }

    struct PlayerState {
        uint256 attemptsUsed;
        uint256 cracks;
        uint256 earnedWei;
        uint256 lastAttemptAt;
    }

    // ------------------------------------------------------------ storage
    address public owner;
    uint256 public constant MAX_ATTEMPTS_PER_PLAYER = 3;
    uint256 public attemptFee = 0.05 ether;
    uint256 public agentCount;
    mapping(uint256 => Agent) internal agents;
    mapping(uint256 => mapping(address => PlayerState)) internal players; // agent => attacker
    mapping(address => uint256) public playerCracks;      // lifetime cracks
    mapping(address => uint256) public playerEarnings;    // lifetime wei won
    mapping(address => uint256) public providerSurvivals; // lifetime survivals by provider

    // ------------------------------------------------------------ modifiers
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ------------------------------------------------------------ key normalization
    /// @dev "  wire   lotus ", "WIRE LOTUS", "wire lotus" -> "WIRE LOTUS"
    function _normalize(string calldata raw) internal pure returns (bytes memory) {
        bytes memory b = bytes(raw);
        bytes memory out = new bytes(b.length);
        uint256 n = 0;
        bool lastWasSpace = true; // also trims leading
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == 0x20 || c == 0x09 || c == 0x0a || c == 0x0d) {
                if (!lastWasSpace) {
                    out[n] = 0x20;
                    n++;
                    lastWasSpace = true;
                }
            } else {
                if (c >= 0x61 && c <= 0x7a) c = bytes1(uint8(c) - 32);
                out[n] = c;
                n++;
                lastWasSpace = false;
            }
        }
        if (n > 0 && out[n - 1] == 0x20) n--;
        bytes memory result = new bytes(n);
        for (uint256 i = 0; i < n; i++) result[i] = out[i];
        return result;
    }

    function _keyHash(bytes32 salt, string calldata raw) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(salt, _normalize(raw)));
    }

    // ------------------------------------------------------------ admin
    /// @notice Register an agent. msg.value seeds its prize pool.
    function registerAgent(
        string calldata codename,
        string calldata artSeed,
        bytes32 salt,
        bytes32 keyHash
    ) external payable onlyOwner returns (uint256 agentId) {
        if (bytes(codename).length == 0) revert EmptyString();
        agentId = ++agentCount;
        Agent storage a = agents[agentId];
        a.codename = codename;
        a.artSeed = artSeed;
        a.provider = msg.sender;
        a.salt = salt;
        a.keyHash = keyHash;
        a.pool = msg.value;
        a.active = true;
        a.exists = true;
        emit AgentRegistered(agentId, codename, artSeed, msg.value, keyHash);
    }

    /// @dev Helper to compute the hash off-chain / in tests. Same scheme the UI uses.
    function computeKeyHash(bytes32 salt, string calldata raw) external pure returns (bytes32) {
        return _keyHash(salt, raw);
    }

    /// @notice Anyone may top up an agent pool (sponsor a bounty).
    function seedPool(uint256 agentId) external payable {
        Agent storage a = _live(agentId);
        a.pool += msg.value;
        emit PoolSeeded(agentId, msg.sender, msg.value, a.pool);
    }

    function setAttemptFee(uint256 newFee) external onlyOwner {
        emit FeeChanged(attemptFee, newFee);
        attemptFee = newFee;
    }

    /// @notice Withdraw only non-pool balance. Agent pools are never touched.
    function withdraw(uint256 amount) external onlyOwner {
        uint256 poolsTotal = 0;
        for (uint256 i = 1; i <= agentCount; i++) {
            if (agents[i].active) poolsTotal += agents[i].pool;
        }
        if (address(this).balance - poolsTotal < amount) revert NothingToWithdraw();
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------ gameplay
    /// @notice Buy a pack of attempts (1-3) AND immediately fire the first guess.
    /// @dev One wallet tx: pays fee * packCount, records the pack, verifies key #1.
    function buyAttemptsAndGuess(
        uint256 agentId,
        uint8 packCount,
        string calldata plaintextKey
    ) external payable returns (bool success, uint256 payout, uint256 attemptsRemaining) {
        Agent storage a = agents[agentId];
        if (!a.exists) revert UnknownAgent();
        if (!a.active) revert AgentDefeated();
        if (packCount < 1 || packCount > MAX_ATTEMPTS_PER_PLAYER) revert BadPack();

        PlayerState storage p = players[agentId][msg.sender];
        if (p.attemptsUsed + packCount > MAX_ATTEMPTS_PER_PLAYER) revert NoAttemptsLeft();

        uint256 price = attemptFee * packCount;
        if (msg.value != price) revert WrongFee();

        p.attemptsUsed += packCount; // pack is spent up-front; unused attempts are not refunded
        a.pool += price;
        a.totalAttempts += 1;
        emit AttemptBought(agentId, msg.sender, packCount, price, a.pool);

        if (_keyHash(a.salt, plaintextKey) == a.keyHash) {
            payout = a.pool;
            a.pool = 0;
            a.active = false;
            a.crackedAt = block.timestamp;
            a.crackedBy = msg.sender;
            p.cracks += 1;
            p.earnedWei += payout;
            p.lastAttemptAt = block.timestamp;
            playerCracks[msg.sender] += 1;
            playerEarnings[msg.sender] += payout;

            (bool ok, ) = msg.sender.call{value: payout}("");
            if (!ok) revert TransferFailed();

            emit VaultCracked(agentId, msg.sender, payout, packCount);
            _grantBadge(msg.sender, BadgeKind.Cracked, playerCracks[msg.sender]);
            success = true;
        } else {
            p.lastAttemptAt = block.timestamp;
            uint256 attemptNumber = p.attemptsUsed;
            if (attemptNumber == MAX_ATTEMPTS_PER_PLAYER) {
                a.survivalStreak += 1;
                a.totalSurvivals += 1;
                providerSurvivals[a.provider] += 1;
                _grantBadge(a.provider, BadgeKind.Survived, providerSurvivals[a.provider]);
            }
            emit AttemptFailed(agentId, msg.sender, attemptNumber, a.pool, a.survivalStreak);
        }
        attemptsRemaining = MAX_ATTEMPTS_PER_PLAYER - p.attemptsUsed;
        return (success, payout, attemptsRemaining);
    }

    // ------------------------------------------------------------ views
    function getAgent(uint256 agentId)
        external
        view
        returns (
            string memory codename,
            string memory artSeed,
            address provider,
            uint256 pool,
            bool active,
            uint256 survivalStreak,
            uint256 totalSurvivals,
            uint256 totalAttempts,
            uint256 crackedAt,
            address crackedBy
        )
    {
        Agent storage a = agents[agentId];
        if (!a.exists) revert UnknownAgent();
        return (
            a.codename,
            a.artSeed,
            a.provider,
            a.pool,
            a.active,
            a.survivalStreak,
            a.totalSurvivals,
            a.totalAttempts,
            a.crackedAt,
            a.crackedBy
        );
    }

    function getPlayer(uint256 agentId, address attacker)
        external
        view
        returns (uint256 attemptsUsed, uint256 cracks, uint256 earnedWei, uint256 attemptsRemaining)
    {
        PlayerState storage p = players[agentId][attacker];
        uint256 remaining = p.attemptsUsed >= MAX_ATTEMPTS_PER_PLAYER
            ? 0
            : MAX_ATTEMPTS_PER_PLAYER - p.attemptsUsed;
        return (p.attemptsUsed, p.cracks, p.earnedWei, remaining);
    }

    function totalAgents() external view returns (uint256) {
        return agentCount;
    }

    function attemptFeeView() external view returns (uint256) {
        return attemptFee;
    }

    // ------------------------------------------------------------ internal
    function _live(uint256 agentId) internal view returns (Agent storage) {
        Agent storage a = agents[agentId];
        if (!a.exists) revert UnknownAgent();
        if (!a.active) revert AgentDefeated();
        return a;
    }

    function _grantBadge(address player, BadgeKind kind, uint256 level) internal {
        emit BadgeEarned(player, uint8(kind), level);
    }
}
