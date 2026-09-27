// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VaultArena} from "../src/VaultArena.sol";

contract VaultArenaTest is Test {
    VaultArena arena;
    address owner = makeAddr("owner");
    address alice = makeAddr("alice"); // attacker
    address bob = makeAddr("bob");     // attacker 2

    uint256 constant FEE = 0.05 ether; // must match contract default attemptFee

    function setUp() public {
        vm.deal(owner, 100 ether);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.prank(owner);
        arena = new VaultArena();
    }

    // ---------- helpers ----------

    function _reg(string memory codename, string memory key, uint256 seed) internal returns (uint256 id) {
        bytes32 salt = keccak256("salt-a");
        bytes32 keyHash = arena.computeKeyHash(salt, key);
        vm.prank(owner);
        return arena.registerAgent{value: seed}(codename, "art", salt, keyHash);
    }

    function _pool(uint256 id) internal view returns (uint256) {
        (,,, uint256 p,,,,,, ) = arena.getAgent(id);
        return p;
    }

    function _active(uint256 id) internal view returns (bool) {
        (,,,, bool act,,,,, ) = arena.getAgent(id);
        return act;
    }

    // ---------- registration ----------

    function test_RegisterAgent() public {
        uint256 id = _reg("Architect", "OBSIDIAN SPIRE", 1 ether);
        (string memory name,,, uint256 pool, bool active,,,,, ) = arena.getAgent(id);
        assertEq(arena.agentCount(), 1);
        assertEq(name, "Architect");
        assertEq(pool, 1 ether);
        assertTrue(active);
    }

    function test_Normalization() public view {
        bytes32 salt = keccak256("s");
        bytes32 h1 = arena.computeKeyHash(salt, "OBSIDIAN SPIRE");
        bytes32 h2 = arena.computeKeyHash(salt, "  obsidian    spire  ");
        bytes32 h3 = arena.computeKeyHash(salt, "obsidian spire");
        bytes32 h4 = arena.computeKeyHash(salt, "Obsidian\tSpire");
        assertEq(h1, h2, "multi-space + trim");
        assertEq(h1, h3, "case-insensitive");
        assertEq(h1, h4, "tab as separator");
        assertFalse(h1 == arena.computeKeyHash(salt, "obsidian spirez"));
        assertFalse(h1 == arena.computeKeyHash(salt, "OBSIDIAN"));
    }

    // ---------- gameplay ----------

    function test_WrongGuessGrowsPool() public {
        uint256 id = _reg("Siren", "SALT MOON", 1 ether);
        vm.prank(alice);
        (bool ok, uint256 payout, uint256 remaining) =
            arena.buyAttemptsAndGuess{value: FEE}(id, 1, "wrong key");
        assertFalse(ok);
        assertEq(payout, 0);
        assertEq(remaining, 2);
        assertEq(_pool(id), 1 ether + FEE, "pool must grow by fee");
    }

    function test_CorrectGuessPaysOut() public {
        uint256 id = _reg("Ghost", "WIRE LOTUS", 1 ether);
        uint256 before = alice.balance;
        vm.prank(alice);
        (bool ok, uint256 payout, ) = arena.buyAttemptsAndGuess{value: FEE}(id, 1, "wire lotus");
        assertTrue(ok);
        assertEq(payout, 1 ether + FEE, "payout = seed + fee");
        assertEq(alice.balance, before - FEE + 1 ether + FEE);
        assertFalse(_active(id), "agent defeated");
        assertEq(arena.playerCracks(alice), 1);
        assertEq(arena.playerEarnings(alice), 1 ether + FEE);
    }

    function test_ThreeFailsSurvivalBadgeAndLockout() public {
        uint256 id = _reg("Null", "ZERO HARVEST", 1 ether);
        vm.startPrank(alice);
        arena.buyAttemptsAndGuess{value: FEE}(id, 1, "a");
        arena.buyAttemptsAndGuess{value: FEE}(id, 1, "b");
        vm.expectEmit(true, true, true, true);
        emit VaultArena.BadgeEarned(owner, uint8(VaultArena.BadgeKind.Survived), 1);
        arena.buyAttemptsAndGuess{value: FEE}(id, 1, "c");
        vm.stopPrank();

        (,,, uint256 pool,,,,,, ) = arena.getAgent(id);
        (,,,, bool active,,,,, ) = arena.getAgent(id);
        (,,,,, uint256 streak, uint256 survivals,,, ) = arena.getAgent(id);
        assertEq(pool, 1 ether + 3 * FEE, "pool grew by 3 fees");
        assertTrue(active, "agent survived");
        assertEq(streak, 1);
        assertEq(survivals, 1);
        assertEq(arena.providerSurvivals(owner), 1);

        vm.prank(alice);
        vm.expectRevert(VaultArena.NoAttemptsLeft.selector);
        arena.buyAttemptsAndGuess{value: FEE}(id, 1, "d");
    }

    function test_PackOfThreeOneTx() public {
        uint256 id = _reg("Warden", "IRON VESPER", 2 ether);
        vm.prank(alice);
        (bool ok, uint256 payout, uint256 remaining) =
            arena.buyAttemptsAndGuess{value: 3 * FEE}(id, 3, "nope");
        assertFalse(ok);
        assertEq(payout, 0);
        assertEq(remaining, 0, "all 3 spent");
        (uint256 used2,,, ) = arena.getPlayer(id, alice);
        assertEq(used2, 3);
        // locked out now
        vm.prank(alice);
        vm.expectRevert(VaultArena.NoAttemptsLeft.selector);
        arena.buyAttemptsAndGuess{value: FEE}(id, 1, "again");
    }

    function test_SecondAttackerBlockedAfterCrack() public {
        uint256 id = _reg("Boss", "SECRET KEY", 1 ether);
        // bob fails all 3 -> pool grows
        vm.startPrank(bob);
        arena.buyAttemptsAndGuess{value: FEE}(id, 1, "x");
        arena.buyAttemptsAndGuess{value: FEE}(id, 1, "y");
        arena.buyAttemptsAndGuess{value: FEE}(id, 1, "z");
        vm.stopPrank();
        assertEq(_pool(id), 1 ether + 3 * FEE);

        // alice cracks it and takes seed + all failed fees
        uint256 before = alice.balance;
        vm.prank(alice);
        (bool ok, uint256 payout, ) = arena.buyAttemptsAndGuess{value: FEE}(id, 1, "  secret   key ");
        assertTrue(ok);
        assertEq(payout, 1 ether + 4 * FEE, "winner takes seed + 4 fees");
        assertEq(alice.balance, before - FEE + 1 ether + 4 * FEE);

        // bob cannot attack a defeated agent
        vm.prank(bob);
        vm.expectRevert(VaultArena.AgentDefeated.selector);
        arena.buyAttemptsAndGuess{value: FEE}(id, 1, "SECRET KEY");
    }

    function test_CannotExceedThreeAttempts() public {
        uint256 id = _reg("Boss", "SECRET KEY", 1 ether);
        vm.prank(alice);
        arena.buyAttemptsAndGuess{value: 2 * FEE}(id, 2, "x");
        vm.prank(alice);
        (,, uint256 remaining) = arena.buyAttemptsAndGuess{value: FEE}(id, 1, "y");
        assertEq(remaining, 0);
        vm.prank(alice);
        vm.expectRevert(VaultArena.NoAttemptsLeft.selector);
        arena.buyAttemptsAndGuess{value: FEE}(id, 1, "z");
    }

    function test_WrongFeeReverts() public {
        uint256 id = _reg("Boss", "SECRET KEY", 1 ether);
        vm.prank(alice);
        vm.expectRevert(VaultArena.WrongFee.selector);
        arena.buyAttemptsAndGuess{value: FEE / 2}(id, 1, "k");
    }

    function test_BadPackReverts() public {
        uint256 id = _reg("Boss", "SECRET KEY", 1 ether);
        vm.prank(alice);
        vm.expectRevert(VaultArena.BadPack.selector);
        arena.buyAttemptsAndGuess{value: 4 * FEE}(id, 4, "k");
    }

    function test_SecondWinnerCannotDoubleClaim() public {
        uint256 id = _reg("Boss", "SECRET KEY", 1 ether);
        vm.prank(alice);
        arena.buyAttemptsAndGuess{value: FEE}(id, 1, "SECRET KEY");
        vm.prank(bob);
        vm.expectRevert(VaultArena.AgentDefeated.selector);
        arena.buyAttemptsAndGuess{value: FEE}(id, 1, "SECRET KEY");
    }

    function test_SeedPoolAnyone() public {
        uint256 id = _reg("Boss", "SECRET KEY", 1 ether);
        vm.prank(bob);
        arena.seedPool{value: 0.5 ether}(id);
        assertEq(_pool(id), 1.5 ether);
    }

    function test_OnlyOwnerRegister() public {
        bytes32 salt = keccak256("s");
        bytes32 kh = arena.computeKeyHash(salt, "K");
        vm.prank(alice);
        vm.expectRevert(VaultArena.NotOwner.selector);
        arena.registerAgent("X", "art", salt, kh);
    }

    function test_WithdrawOnlyExcess() public {
        _reg("Boss", "SECRET KEY", 1 ether);
        // contract balance = 1 ether (all in pool). withdraw should fail.
        vm.prank(owner);
        vm.expectRevert(VaultArena.NothingToWithdraw.selector);
        arena.withdraw(0.1 ether);
        // top up via a failed attempt: pool grows equally so still nothing free
        // (fee goes into pool). Use a defeated agent to leave stray funds:
        // crack it -> pool paid out, balance 0. Then hardcode some ETH in.
        vm.deal(address(arena), 3 ether);
        vm.prank(owner);
        arena.withdraw(2 ether);
        assertEq(owner.balance, 100 ether + 1 ether);
    }
}
