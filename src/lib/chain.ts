import { createPublicClient, createWalletClient, http, custom, formatEther, keccak256, toHex, concat, encodeAbiParameters } from "viem";
import { parseAbi } from "viem";

/**
 * VAULT — Monad testnet chain plumbing (shared by server + client).
 * Works against Monad testnet (10143) and local anvil (31337) alike.
 */

export const MONAD_TESTNET = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" },
  },
} as const;

export const ANVIL_LOCAL = {
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  blockExplorers: { default: { name: "Local", url: "" } },
} as const;

function envRpc(): string {
  if (typeof process !== "undefined" && process.env) {
    return process.env["MONAD_RPC_URL"] || "https://testnet-rpc.monad.xyz";
  }
  return "https://testnet-rpc.monad.xyz";
}

export function activeChainId(): number {
  if (typeof process !== "undefined" && process.env && process.env["VAULT_CHAIN_ID"]) {
    return Number(process.env["VAULT_CHAIN_ID"]);
  }
  return MONAD_TESTNET.id;
}

export function publicClient(rpcUrl?: string) {
  const chain = activeChainId() === ANVIL_LOCAL.id ? ANVIL_LOCAL : MONAD_TESTNET;
  return createPublicClient({
    chain,
    transport: http(rpcUrl ?? envRpc(), { batch: true }),
  });
}

// --------------------------------------------------------------- ABI

export const vaultArenaAbi = parseAbi([
  "function registerAgent(string calldata codename, string calldata artSeed, bytes32 salt, bytes32 keyHash) external payable returns (uint256 agentId)",
  "function computeKeyHash(bytes32 salt, string calldata raw) external pure returns (bytes32)",
  "function seedPool(uint256 agentId) external payable",
  "function setAttemptFee(uint256 newFee) external",
  "function withdraw(uint256 amount) external",
  "function buyAttemptsAndGuess(uint256 agentId, uint8 packCount, string calldata plaintextKey) external payable returns (bool success, uint256 payout, uint256 attemptsRemaining)",
  "function getAgent(uint256 agentId) external view returns (string codename, string artSeed, address provider, uint256 pool, bool active, uint256 survivalStreak, uint256 totalSurvivals, uint256 totalAttempts, uint256 crackedAt, address crackedBy)",
  "function getPlayer(uint256 agentId, address attacker) external view returns (uint256 attemptsUsed, uint256 cracks, uint256 earnedWei, uint256 attemptsRemaining)",
  "function totalAgents() external view returns (uint256)",
  "function attemptFee() external view returns (uint256)",
  "function owner() external view returns (address)",
  "function playerCracks(address) external view returns (uint256)",
  "function playerEarnings(address) external view returns (uint256)",
  "function providerSurvivals(address) external view returns (uint256)",
  "event AgentRegistered(uint256 indexed agentId, string codename, string artSeed, uint256 seedPool, bytes32 keyHash)",
  "event PoolSeeded(uint256 indexed agentId, address indexed funder, uint256 amount, uint256 newPool)",
  "event AttemptBought(uint256 indexed agentId, address indexed attacker, uint256 packCount, uint256 price, uint256 newPool)",
  "event AttemptFailed(uint256 indexed agentId, address indexed attacker, uint256 attemptNumber, uint256 poolAfter, uint256 streak)",
  "event VaultCracked(uint256 indexed agentId, address indexed attacker, uint256 payout, uint256 attemptsUsed)",
  "event BadgeEarned(address indexed player, uint8 indexed kind, uint256 level)",
]);

export type VaultArenaAbi = typeof vaultArenaAbi;

export function explorerTxUrl(chainId: number, hash: string): string {
  if (chainId === MONAD_TESTNET.id) return `https://testnet.monadexplorer.com/tx/${hash}`;
  return "";
}

// --------------------------------------------------------------- key hashing (must match contract normalization)

/** Normalize exactly like the contract: uppercase, collapse whitespace, trim. */
export function normalizeKey(raw: string): string {
  const up = raw.toUpperCase();
  const collapsed = up.replace(/[\s\u0009\u000A\u000D]+/g, " ").trim();
  return collapsed;
}

export function keyHash(salt: `0x${string}` | string, raw: string): `0x${string}` {
  const normalized = toHex(normalizeKey(raw), { size: undefined }) as unknown as string;
  // encodePacked(bytes32, string) — string is utf8 bytes, no length prefix
  const hexString = toHex(normalizeKey(raw));
  return keccak256(concat([salt as `0x${string}`, hexString as `0x${string}`]));
}

export function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function fmtMon(wei: bigint): string {
  return formatEther(wei);
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
