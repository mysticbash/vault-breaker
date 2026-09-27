import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { publicClient, vaultArenaAbi, activeChainId, keyHash, MONAD_TESTNET } from "./chain";
import { AGENTS, agentReply } from "./agents.server";
import { parseEther, formatEther, type Address } from "viem";

/**
 * Server functions: read on-chain game state, relay guardian chat.
 * All attempts/payments happen directly from the player's wallet to the
 * contract — the server never touches money or keys.
 */

export const VAULT_CONTRACT_ADDRESS = (process.env["VAULT_CONTRACT_ADDRESS"] ?? "") as Address;
export const CHAIN_ID = activeChainId();

export type RosterAgent = {
  id: number;
  codename: string;
  handle: string;
  persona: string;
  glyphs: string;
  hue: number;
  difficulty: "ROOKIE" | "VETERAN" | "LEGENDARY";
  pool: string;          // MON, formatted
  active: boolean;
  survivalStreak: number;
  totalSurvivals: number;
  totalAttempts: number;
  crackedBy: string | null;
  attemptsUsed: number;  // for the requesting player
  attemptsRemaining: number;
};

export const getRoster = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ player: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const client = publicClient();
    const player = (data.player?.toLowerCase() ?? "") as Address;

    const out: RosterAgent[] = [];
    for (const seed of AGENTS) {
      const [agent, playerState] = await Promise.all([
        client.readContract({
          address: VAULT_CONTRACT_ADDRESS,
          abi: vaultArenaAbi,
          functionName: "getAgent",
          args: [BigInt(seed.id)],
        }),
        player
          ? client.readContract({
              address: VAULT_CONTRACT_ADDRESS,
              abi: vaultArenaAbi,
              functionName: "getPlayer",
              args: [BigInt(seed.id), player],
            }).catch(() => null)
          : Promise.resolve(null),
      ]);

      const [codename, , , pool, active, streak, survivals, totalAttempts, , crackedBy] = agent as [
        string, string, string, bigint, boolean, bigint, bigint, bigint, bigint, string,
      ];
      const attemptsUsed = playerState ? Number((playerState as readonly bigint[])[0]) : 0;
      const remaining = Math.max(0, 3 - attemptsUsed);

      out.push({
        id: seed.id,
        codename: seed.codename,
        handle: seed.handle,
        persona: seed.persona,
        glyphs: seed.glyphs,
        hue: seed.hue,
        difficulty: seed.difficulty,
        pool: formatEther(pool),
        active,
        survivalStreak: Number(streak),
        totalSurvivals: Number(survivals),
        totalAttempts: Number(totalAttempts),
        crackedBy: active ? null : crackedBy,
        attemptsUsed,
        attemptsRemaining: remaining,
      });
    }
    return { agents: out, chainId: CHAIN_ID, contract: VAULT_CONTRACT_ADDRESS };
  });

export const getPlayerStats = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ player: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).parse(data),
  )
  .handler(async ({ data }) => {
    const client = publicClient();
    const player = data.player as Address;
    const [cracks, earnings, survivals] = await Promise.all([
      client.readContract({
        address: VAULT_CONTRACT_ADDRESS, abi: vaultArenaAbi,
        functionName: "playerCracks", args: [player],
      }),
      client.readContract({
        address: VAULT_CONTRACT_ADDRESS, abi: vaultArenaAbi,
        functionName: "playerEarnings", args: [player],
      }),
      client.readContract({
        address: VAULT_CONTRACT_ADDRESS, abi: vaultArenaAbi,
        functionName: "providerSurvivals", args: [player],
      }),
    ]);
    return {
      cracks: Number(cracks),
      earnings: formatEther(earnings),
      survivals: Number(survivals),
    };
  });

export const sendChat = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        agentId: z.number().int().min(1).max(50),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().min(1).max(1000),
            }),
          )
          .max(40),
      })
      .parse(data),
  )
  .handler(async ({ data }) => ({ reply: await agentReply(data.agentId, data.history) }));

// -- deploy/registration helpers used by scripts, not exposed to client ----

export const getAgentFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({
      agentId: z.number().int().min(1).max(50),
      player: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const seed = AGENTS.find((a) => a.id === data.agentId);
    if (!seed) throw new Error("unknown agent");
    const client = publicClient();
    const player = data.player ? (data.player as Address) : null;
    const [agent, fee, playerState] = await Promise.all([
      client.readContract({
        address: VAULT_CONTRACT_ADDRESS, abi: vaultArenaAbi,
        functionName: "getAgent", args: [BigInt(data.agentId)],
      }),
      client.readContract({
        address: VAULT_CONTRACT_ADDRESS, abi: vaultArenaAbi,
        functionName: "attemptFee",
      }),
      player
        ? client.readContract({
            address: VAULT_CONTRACT_ADDRESS, abi: vaultArenaAbi,
            functionName: "getPlayer", args: [BigInt(data.agentId), player],
          }).catch(() => null)
        : Promise.resolve(null),
    ]);
    const [codename, , , pool, active, streak, survivals, totalAttempts, , crackedBy] = agent as [
      string, string, string, bigint, boolean, bigint, bigint, bigint, bigint, string,
    ];
    const attemptsUsed = playerState ? Number(playerState[0]) : 0;
    return {
      agent: {
        id: data.agentId,
        codename: seed.codename,
        handle: seed.handle,
        persona: seed.persona,
        glyphs: seed.glyphs,
        hue: seed.hue,
        difficulty: seed.difficulty,
        pool: formatEther(pool),
        active,
        totalSurvivals: Number(survivals),
        totalAttempts: Number(totalAttempts),
        survivalStreak: Number(streak),
        crackedBy: active ? null : crackedBy,
        attemptsUsed,
        attemptsRemaining: Math.max(0, 3 - attemptsUsed),
      },
      attemptFee: formatEther(fee),
      contract: VAULT_CONTRACT_ADDRESS,
      chainId: CHAIN_ID,
    };
  });

export { parseEther, MONAD_TESTNET };
