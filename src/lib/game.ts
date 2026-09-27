import { encodeFunctionData, parseEther, decodeEventLog, type Hash, type Address, createPublicClient, http } from "viem";
import { vaultArenaAbi, MONAD_TESTNET, ANVIL_LOCAL, explorerTxUrl } from "./chain";

/**
 * Client-side game engine: builds wallet txs, parses results, computes badges.
 * All money moves player-wallet -> contract directly. Server never touches it.
 */

export type GameConfig = {
  contract: Address;
  chainId: number;
  attemptFee: string; // MON
};

export function rpcUrlFor(chainId: number): string {
  return chainId === ANVIL_LOCAL.id ? "http://127.0.0.1:8545" : MONAD_TESTNET.rpcUrls.default.http[0];
}

export function chainClient(chainId: number) {
  const chain = chainId === ANVIL_LOCAL.id ? ANVIL_LOCAL : MONAD_TESTNET;
  return createPublicClient({ chain, transport: http(rpcUrlFor(chainId)) });
}

export function txLink(chainId: number, hash: string): string {
  return explorerTxUrl(chainId, hash);
}

// ---------------------------------------------------------- tx building

export function encodeBuyAndGuess(agentId: number, packCount: number, plaintextKey: string): { data: `0x${string}`; value: bigint } {
  const data = encodeFunctionData({
    abi: vaultArenaAbi,
    functionName: "buyAttemptsAndGuess",
    args: [BigInt(agentId), packCount, plaintextKey],
  });
  return { data, value: 0n }; // value filled by caller using current fee
}

/** Exact wei the contract expects: rounding here reverts with WrongFee. */
export function feeFor(feeMon: string, packCount: number): bigint {
  return parseEther(feeMon) * BigInt(packCount);
}

// ---------------------------------------------------------- result parsing

export type AttemptOutcome =
  | { kind: "cracked"; payout: bigint; txHash: string; badgeLevel: number }
  | { kind: "failed"; attemptNumber: number; poolAfter: bigint; streak: number; txHash: string }
  | { kind: "reverted"; reason: string; txHash: string };

export function parseAttemptReceipt(logs: any[], txHash: string): AttemptOutcome {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: vaultArenaAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "VaultCracked") {
        return {
          kind: "cracked",
          payout: (decoded.args as any).payout,
          txHash,
          badgeLevel: 1,
        };
      }
      if (decoded.eventName === "AttemptFailed") {
        const a = decoded.args as any;
        return {
          kind: "failed",
          attemptNumber: Number(a.attemptNumber),
          poolAfter: a.poolAfter,
          streak: Number(a.streak),
          txHash,
        };
      }
    } catch {
      // not our event — skip
    }
  }
  return { kind: "reverted", reason: "No result events found", txHash };
}

// ---------------------------------------------------------- badges

export type Badge = {
  title: string;
  glyph: string;
  tier: "none" | "bronze" | "silver" | "gold" | "mythic";
  nextAt: number | null;
};

/** Attacker status: based on lifetime vaults cracked (on-chain). */
export function attackerBadge(cracks: number): Badge {
  if (cracks >= 5) return { title: "LEGENDARY BREAKER", glyph: "👑", tier: "mythic", nextAt: null };
  if (cracks === 4) return { title: "PHANTOM", glyph: "☠️", tier: "gold", nextAt: 5 };
  if (cracks === 3) return { title: "MASTERMIND", glyph: "🧠", tier: "gold", nextAt: 4 };
  if (cracks === 2) return { title: "GHOST", glyph: "👻", tier: "silver", nextAt: 3 };
  if (cracks === 1) return { title: "FIRST BLOOD", glyph: "🩸", tier: "bronze", nextAt: 2 };
  return { title: "PROWLER", glyph: "🐾", tier: "none", nextAt: 1 };
}

/** Defender status: based on raids the guardian survived (on-chain). */
export function defenderBadge(survivals: number): Badge {
  if (survivals >= 10) return { title: "UNBREAKABLE", glyph: "♾️", tier: "mythic", nextAt: null };
  if (survivals >= 6) return { title: "MYTHIC SENTINEL", glyph: "🔮", tier: "mythic", nextAt: 10 };
  if (survivals >= 3) return { title: "IRON WARDEN", glyph: "⚔️", tier: "gold", nextAt: 6 };
  if (survivals >= 1) return { title: "IRON GUARDIAN", glyph: "🛡️", tier: "silver", nextAt: 3 };
  return { title: "UNTESTED", glyph: "◌", tier: "none", nextAt: 1 };
}

export type AgentTier = "ROOKIE" | "VETERAN" | "LEGENDARY";

export function agentTier(survivals: number): AgentTier {
  if (survivals >= 10) return "LEGENDARY";
  if (survivals >= 3) return "VETERAN";
  return "ROOKIE";
}

export function tierStars(tier: AgentTier): string {
  return tier === "LEGENDARY" ? "★★★" : tier === "VETERAN" ? "★★" : "★";
}

// ---------------------------------------------------------- misc

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function fmtMon(wei: bigint | string | number): string {
  const n = typeof wei === "bigint" ? Number(wei) / 1e18 : parseFloat(String(wei));
  return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2);
}
