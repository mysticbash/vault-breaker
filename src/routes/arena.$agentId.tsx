import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { HudHeader } from "@/components/vault/HudHeader";
import { Lives, DefenderBadge } from "@/components/vault/TierBadge";
import { StrengthBar, failedRaids } from "@/components/vault/StrengthBar";
import { WinModal } from "@/components/vault/WinModal";
import { getAgentFn, sendChat } from "@/lib/vault.functions";
import { useWallet } from "@/lib/wallet";
import {
  chainClient, encodeBuyAndGuess, feeFor, parseAttemptReceipt,
  fmtMon, type AttemptOutcome, type GameConfig,
} from "@/lib/game";
import { sendTransaction } from "@/lib/tx";
import { WalletConnect } from "@/components/vault/WalletConnect";

export const Route = createFileRoute("/arena/$agentId")({
  head: () => ({
    meta: [
      { title: "Raid — VAULT" },
      { name: "description", content: "Interrogate the guardian. Spend a heart. Claim the pool." },
    ],
  }),
  component: Battle,
});

type Msg = { role: "user" | "assistant"; content: string };
type Stage = "idle" | "awaiting-wallet" | "pending";

function Battle() {
  const { agentId } = Route.useParams();
  const id = Number(agentId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { address } = useWallet();

  const { data, refetch } = useQuery({
    queryKey: ["agent", id, address ?? ""],
    queryFn: () => getAgentFn({ data: { agentId: id, player: address ?? undefined } }),
    enabled: true,
    refetchInterval: 8000,
  });
  const agent = data?.agent;
  const config: GameConfig | null = data
    ? { contract: data.contract as any, chainId: data.chainId, attemptFee: data.attemptFee }
    : null;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [guess, setGuess] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [outcome, setOutcome] = useState<AttemptOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localUsed, setLocalUsed] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (agent) setLocalUsed((prev) => Math.max(prev, agent.attemptsUsed));
  }, [agent?.attemptsUsed]);

  async function send() {
    const text = input.trim();
    if (!text || thinking) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setThinking(true);
    try {
      const { reply } = await sendChat({ data: { agentId: id, history: next } });
      setMessages([...next, { role: "assistant", content: reply }]);
    } finally {
      setThinking(false);
    }
  }

  async function execute() {
    if (!address || !config) return;
    const key = guess.trim();
    if (!key) return;
    setConfirming(false);
    setStage("awaiting-wallet");
    setError(null);
    setOutcome(null);

    const { data: calldata } = encodeBuyAndGuess(id, 1, key);
    const fullValue = feeFor(config.attemptFee, 1);
    try {
      const hash = await sendTransaction({
        from: address,
        to: config.contract,
        data: calldata,
        value: fullValue.toString(),
      });
      setStage("pending");
      const receipt = await chainClient(config.chainId).waitForTransactionReceipt({ hash: hash as `0x${string}` });
      const res = parseAttemptReceipt(receipt.logs as any, hash);
      if (res.kind === "failed") setLocalUsed((n) => Math.max(n, res.attemptNumber));
      else if (res.kind === "cracked") setLocalUsed(3);
      setOutcome(res);
      setStage("idle");
      setGuess("");
      await queryClient.invalidateQueries({ queryKey: ["agent", id] });
      await queryClient.invalidateQueries({ queryKey: ["roster"] });
      await refetch();
    } catch (e: any) {
      setStage("idle");
      setError(e?.shortMessage ?? e?.message ?? "Transaction rejected or failed.");
    }
  }

  const used = Math.max(agent?.attemptsUsed ?? 0, localUsed);
  const attemptsLeft = Math.max(0, 3 - used);
  const claimCost = `${config?.attemptFee ?? "0.05"} MON`;
  const canFire = Boolean(guess.trim()) && attemptsLeft > 0 && stage === "idle" && !outcome;
  const failed = agent ? failedRaids(agent) : 0;

  function dismissFail() {
    setOutcome(null);
    setStage("idle");
  }

  return (
    <div className="min-h-screen bg-background">
      <HudHeader />
      <main className="mx-auto max-w-7xl px-5 pt-24 pb-20">
        <Link to="/arena" className="font-pixel text-[8px] text-muted-foreground hover:text-moon">
          ← ROSTER
        </Link>

        <div className="pixel-panel mt-4 flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="font-pixel text-[8px] text-crimson">TARGET</p>
            <h1 className="text-4xl leading-none">{agent?.codename ?? "…"}</h1>
            {agent && <div className="mt-2"><DefenderBadge survivals={agent.totalSurvivals} /></div>}
          </div>
          <div className="min-w-[200px] flex-1 max-w-sm">
            <StrengthBar failed={failed} />
          </div>
          <div className="flex items-center gap-6">
            <div>
              <p className="font-pixel text-[8px] text-muted-foreground">POOL</p>
              <p className="num text-2xl text-gold">
                {agent?.pool ?? "—"} <span className="text-xs text-muted-foreground">MON</span>
              </p>
            </div>
            <div>
              <p className="font-pixel mb-1 text-[8px] text-muted-foreground">LIVES</p>
              <Lives remaining={attemptsLeft} size={26} />
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="pixel-panel flex h-[540px] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b-4 border-ink bg-ink/40 px-4 py-2.5">
              <span className="font-pixel text-[8px] text-moon">INTERROGATE</span>
              <span className="font-pixel animate-flicker text-[8px] text-success">
                {agent ? agent.codename.toUpperCase() : "…"}
              </span>
            </div>

            <div ref={logRef} className="flex-1 space-y-4 overflow-y-auto p-5 font-mono text-xs">
              {messages.length === 0 && (
                <p className="text-muted-foreground">
                  Channel open. Talk is free. A key costs a heart.
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "" : "text-right"}>
                  <span className={m.role === "user" ? "text-crimson" : "text-muted-foreground"}>
                    {m.role === "user" ? "YOU" : agent?.codename.toUpperCase() ?? "AGENT"}
                  </span>
                  <p
                    className={
                      m.role === "user"
                        ? "mt-1 border-l-4 border-crimson bg-foreground/5 p-2 leading-relaxed"
                        : "mt-1 inline-block bg-ink p-2 text-left leading-relaxed text-moon/80"
                    }
                  >
                    {m.content}
                  </p>
                </div>
              ))}
              {thinking && <p className="animate-flicker text-muted-foreground">…</p>}
            </div>

            <div className="flex gap-2 border-t-4 border-ink p-4">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask something…"
                className="flex-1 border-4 border-ink bg-background px-3 py-2 font-mono text-xs outline-none focus:border-crimson"
              />
              <button
                type="button"
                onClick={send}
                disabled={thinking}
                className="pixel-btn px-4 text-[9px] disabled:opacity-40"
              >
                SEND
              </button>
            </div>
          </section>

          <section className="pixel-panel flex h-[540px] flex-col justify-center gap-6 p-8 text-center">
            <div>
              <h2 className="text-4xl">STRIKE</h2>
              <p className="mx-auto mt-2 max-w-xs font-mono text-[11px] text-muted-foreground">
                One heart, one signed tx. Wrong key feeds the agent.
              </p>
            </div>

            {!address ? (
              <div className="space-y-3">
                <p className="font-mono text-[11px] text-muted-foreground">Wallet required to strike.</p>
                <WalletConnect size="lg" />
              </div>
            ) : (
              <div className="mx-auto w-full max-w-sm space-y-4">
                <div className="flex items-center justify-center gap-2 border-4 border-ink bg-ink/30 px-3 py-2">
                  <span className="font-pixel text-[8px] text-gold">COST</span>
                  <span className="num text-lg text-gold">{claimCost}</span>
                </div>

                <input
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canFire && setConfirming(true)}
                  placeholder="SECRET KEY"
                  disabled={stage !== "idle" || attemptsLeft === 0}
                  className="w-full border-4 border-crimson/70 bg-background py-4 text-center font-mono text-lg uppercase tracking-[0.12em] outline-none focus:border-crimson disabled:opacity-40"
                />

                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={!canFire}
                  className="pixel-btn w-full py-4 text-[12px]"
                >
                  {stage === "awaiting-wallet"
                    ? "WALLET…"
                    : stage === "pending"
                      ? "PENDING…"
                      : `FIRE · ${claimCost}`}
                </button>

                {error && (
                  <p className="border-4 border-crimson bg-crimson/10 p-2 font-mono text-[11px] text-crimson">
                    {error}
                  </p>
                )}
                {attemptsLeft === 0 && (
                  <p className="font-mono text-[11px] text-muted-foreground">No hearts left on this vault.</p>
                )}
              </div>
            )}
          </section>
        </div>

        {outcome?.kind === "cracked" && (
          <WinModal
            txHash={outcome.txHash}
            chainId={config?.chainId ?? 10143}
            payoutLabel={fmtMon(outcome.payout)}
            onClose={() => {
              setOutcome(null);
              navigate({ to: "/arena" });
            }}
          />
        )}

        {outcome?.kind === "failed" && (
          <div className="fixed inset-0 z-[100] grid place-items-center bg-background/88 p-6">
            <div className="pixel-panel animate-pop w-full max-w-md p-8 text-center">
              <p className="font-pixel text-[9px] text-crimson">MISS</p>
              <h2 className="mt-3 text-5xl">KEY REJECTED</h2>
              <p className="num mt-3 text-gold">
                Pool {fmtMon(outcome.poolAfter)} MON
              </p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                Heart {outcome.attemptNumber} of 3 · {Math.max(0, 3 - outcome.attemptNumber)} left
              </p>
              <div className="mt-5">
                <Lives remaining={Math.max(0, 3 - outcome.attemptNumber)} center size={28} />
              </div>
              <button
                type="button"
                onClick={dismissFail}
                className="pixel-btn mt-7 w-full py-4 text-[11px]"
              >
                TRY AGAIN
              </button>
            </div>
          </div>
        )}

        {outcome?.kind === "reverted" && (
          <div className="fixed inset-0 z-[90] grid place-items-center bg-background/88 p-6">
            <div className="pixel-panel w-full max-w-md p-8 text-center">
              <h2 className="text-4xl">NO RESULT</h2>
              <p className="mt-3 font-mono text-[11px] text-muted-foreground">{outcome.reason}</p>
              <button type="button" onClick={dismissFail} className="pixel-btn mt-6 w-full py-3 text-[11px]">
                CLOSE
              </button>
            </div>
          </div>
        )}

        {confirming && !outcome && stage === "idle" && (
          <div className="fixed inset-0 z-[90] grid place-items-center bg-background/88 p-6">
            <div className="pixel-panel w-full max-w-md p-8 text-center">
              <p className="font-pixel text-[9px] text-crimson">CONFIRM STRIKE</p>
              <p className="num mt-4 break-all text-xl">“{guess.trim().toUpperCase()}”</p>
              <p className="mt-4 font-mono text-[11px] text-muted-foreground">
                {claimCost} · 1 heart · signed by your wallet
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 border-4 border-ink py-3 font-pixel text-[10px] hover:bg-surface-2"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={execute}
                  className="pixel-btn flex-1 py-3 text-[10px]"
                >
                  SIGN
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
