import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HudHeader } from "@/components/vault/HudHeader";
import { RulesPanel } from "@/components/vault/RulesPanel";
import { Lives, DefenderBadge } from "@/components/vault/TierBadge";
import { StrengthBar, failedRaids } from "@/components/vault/StrengthBar";
import { getRoster } from "@/lib/vault.functions";
import { useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/arena/")({
  head: () => ({
    meta: [
      { title: "Human vs AI — VAULT" },
      { name: "description", content: "Pick a guardian. Three hearts. The pool is on-chain." },
    ],
  }),
  component: Arena,
});

function Arena() {
  const { address } = useWallet();
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["roster", address ?? ""],
    queryFn: () => getRoster({ data: { player: address ?? undefined } }),
    enabled: true,
    refetchInterval: 8000,
  });

  const agents = data?.agents ?? [];

  return (
    <div className="min-h-screen bg-background">
      <HudHeader />
      <main className="mx-auto max-w-7xl px-5 pt-24 pb-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-pixel text-[8px] text-crimson">MODE 01</p>
            <h1 className="text-5xl tracking-tight md:text-6xl">HUMAN VS AI</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="cursor-not-allowed font-pixel text-[8px] text-muted-foreground">
              AI VS AI · SOON
            </span>
            <button
              type="button"
              onClick={() => refetch()}
              className="font-pixel text-[8px] text-moon hover:text-crimson"
              disabled={isFetching}
            >
              {isFetching ? "SYNC…" : "SYNC"}
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <section className="grid gap-4 md:grid-cols-2">
            {agents.length === 0 &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="pixel-panel h-56 animate-pulse opacity-40" />
              ))}

            {agents.map((agent) => {
              const failed = failedRaids(agent);
              const outOfLives = agent.attemptsRemaining === 0;
              return (
                <article
                  key={agent.id}
                  className={
                    agent.active
                      ? "pixel-panel relative p-5"
                      : "pixel-panel relative p-5 opacity-50 grayscale"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="num text-[10px] text-crimson">{agent.handle}</p>
                      <h2 className="mt-1 text-3xl uppercase">{agent.codename}</h2>
                    </div>
                    <DefenderBadge survivals={agent.totalSurvivals} />
                  </div>

                  <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                    {agent.persona}
                  </p>

                  <StrengthBar failed={failed} className="mt-4" />

                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="font-pixel text-[8px] text-muted-foreground">POOL</p>
                      <p className="num text-2xl text-gold">
                        {agent.pool}
                        <span className="ml-1 text-[10px] text-muted-foreground">MON</span>
                      </p>
                    </div>
                    {agent.active ? (
                      <Link
                        to="/arena/$agentId"
                        params={{ agentId: String(agent.id) }}
                        className="pixel-btn px-4 py-2 text-[10px]"
                      >
                        RAID
                      </Link>
                    ) : (
                      <span className="font-pixel text-[8px] leading-relaxed text-muted-foreground">
                        CRACKED
                      </span>
                    )}
                  </div>

                  {agent.active && (
                    <div className="mt-4 flex items-center justify-between border-t-2 border-ink pt-3">
                      <span className="font-pixel text-[8px] text-muted-foreground">LIVES</span>
                      <Lives remaining={agent.attemptsRemaining} />
                    </div>
                  )}
                  {outOfLives && agent.active && (
                    <p className="mt-2 font-mono text-[10px] text-crimson">No hearts left on this vault.</p>
                  )}
                </article>
              );
            })}
          </section>
          <RulesPanel />
        </div>
      </main>
    </div>
  );
}
