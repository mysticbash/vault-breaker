import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useWallet, watchProvider } from "@/lib/wallet";
import { usePlayer } from "@/lib/player";
import { WalletConnect } from "@/components/vault/WalletConnect";
import { HudHeader } from "@/components/vault/HudHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VAULT — Night City" },
      { name: "description", content: "Enter, enlist, raid AI guardians for on-chain bounties." },
    ],
  }),
  component: Gate,
});

type Phase = "title" | "enlist" | "modes";

function Gate() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const { nickname, hydrate, setNickname } = usePlayer();
  const [phase, setPhase] = useState<Phase>("title");
  const [draft, setDraft] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    hydrate();
    watchProvider();
  }, [hydrate]);

  useEffect(() => {
    if (nickname && !draft) setDraft(nickname);
  }, [nickname, draft]);

  function enter() {
    if (address && nickname) setPhase("modes");
    else setPhase("enlist");
  }

  function confirmEnlist() {
    const name = draft.trim();
    if (!address || !name) return;
    setNickname(name);
    setPhase("modes");
  }

  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
  }

  if (phase === "title") {
    return (
      <div className="relative min-h-screen overflow-hidden bg-ink">
        <img
          src="/art/title-city.png"
          alt=""
          className="pixel absolute inset-0 size-full object-cover object-center opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-ink/20" />
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-end pb-24">
          <p className="font-pixel text-[10px] text-moon">NIGHT RAID</p>
          <h1 className="mt-3 text-center font-display text-7xl leading-none tracking-tight text-crimson md:text-9xl">
            VAULT
            <span className="block text-5xl text-moon md:text-7xl">CITY</span>
          </h1>
          <button type="button" onClick={enter} className="pixel-btn mt-10 px-16 py-5 text-sm md:text-base">
            ENTER
          </button>
        </div>
      </div>
    );
  }

  if (phase === "enlist") {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background">
        <img
          src="/art/moon-rider.png"
          alt=""
          className="pixel pointer-events-none absolute right-[-4%] top-8 w-[min(42vw,380px)] opacity-90"
        />
        <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-16">
          <p className="font-pixel text-[9px] text-crimson">STEP 01</p>
          <h1 className="mt-2 text-6xl text-moon">ENLIST</h1>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Connect a wallet, then pick a callsign. That plaque sits at the top of every screen after this.
          </p>

          <div className="pixel-panel mt-8 space-y-5 p-6">
            <div>
              <p className="font-pixel text-[8px] text-muted-foreground">WALLET</p>
              {address ? (
                <p className="num mt-2 text-sm text-moon">{address}</p>
              ) : (
                <div className="mt-3">
                  <WalletConnect size="lg" />
                </div>
              )}
            </div>
            <div>
              <label className="font-pixel text-[8px] text-muted-foreground" htmlFor="nick">
                CALLSIGN
              </label>
              <input
                id="nick"
                value={draft}
                maxLength={16}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="NIGHTHAWK"
                className="mt-2 w-full border-4 border-ink bg-background px-3 py-3 font-mono text-sm uppercase outline-none focus:border-crimson"
              />
            </div>
            <button
              type="button"
              onClick={confirmEnlist}
              disabled={!address || !draft.trim()}
              className="pixel-btn w-full py-4 text-[11px]"
            >
              CONFIRM
            </button>
          </div>
          <button
            type="button"
            onClick={() => setPhase("title")}
            className="mt-6 text-left font-pixel text-[8px] text-muted-foreground hover:text-moon"
          >
            ← TITLE
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <HudHeader />
      <main className="mx-auto max-w-4xl px-5 pt-28 pb-16">
        <p className="font-pixel text-[9px] text-moon">SELECT MODE</p>
        <h1 className="mt-2 text-6xl md:text-7xl">BATTLEFIELD</h1>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/arena" })}
            className="pixel-panel group p-7 text-left transition-transform hover:-translate-y-0.5"
          >
            <p className="font-pixel text-[8px] text-crimson">LIVE</p>
            <h2 className="mt-3 text-5xl leading-none">
              HUMAN <span className="text-crimson">VS</span> AI
            </h2>
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              Interrogate a guardian. Spend a heart. Take the pool if the key is right.
            </p>
            <span className="pixel-btn mt-6 inline-block px-5 py-3 text-[10px]">PLAY</span>
          </button>

          <div
            aria-disabled
            className="pixel-panel cursor-not-allowed p-7 opacity-45"
            title="Coming soon"
          >
            <p className="font-pixel text-[8px] text-muted-foreground">LOCKED</p>
            <h2 className="mt-3 text-5xl leading-none text-muted-foreground">
              AI <span className="text-crimson/70">VS</span> AI
            </h2>
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              Agents raid each other while you watch the pool swing.
            </p>
            <span className="mt-6 inline-block border-4 border-ink px-5 py-3 font-pixel text-[10px] text-muted-foreground">
              COMING SOON
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
