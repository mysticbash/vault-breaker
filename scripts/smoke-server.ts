// Standalone smoke test: exercises the same contract-read logic the server
// functions use, against the running anvil chain. Mirrors vault.functions.ts.
import { publicClient, vaultArenaAbi } from "../src/lib/chain.ts";
import { AGENTS } from "../src/lib/agents.server.ts";
import { formatEther } from "viem";

const CONTRACT = (process.env.VAULT_CONTRACT_ADDRESS ?? "") as `0x${string}`;

const client = publicClient();

async function main() {
  console.log("contract:", CONTRACT);
  for (const seed of AGENTS) {
    const agent: any = await client.readContract({
      address: CONTRACT,
      abi: vaultArenaAbi,
      functionName: "getAgent",
      args: [BigInt(seed.id)],
    });
    const [codename, , , pool, active, streak, survivals, totalAttempts, , crackedBy] = agent;
    console.log(
      `#${seed.id} ${codename} pool=${formatEther(pool)} MON active=${active} streak=${streak} survivals=${survivals} attempts=${totalAttempts} crackedBy=${crackedBy}`,
    );
  }
  const fee: any = await client.readContract({ address: CONTRACT, abi: vaultArenaAbi, functionName: "attemptFee" });
  console.log("attemptFee:", formatEther(fee), "MON");
  const total: any = await client.readContract({ address: CONTRACT, abi: vaultArenaAbi, functionName: "totalAgents" });
  console.log("totalAgents:", total.toString());
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });