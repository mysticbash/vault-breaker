import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useWallet, watchProvider } from "@/lib/wallet";
import { shortAddress } from "@/lib/game";
import { usePlayer } from "@/lib/player";
import { WalletConnect } from "./WalletConnect";

export function HudHeader() {
  const wallet = useWallet();
  const { address, error, hasProvider } = wallet;
  const { nickname, hydrate } = usePlayer();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    hydrate();
    watchProvider();
  }, [hydrate]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b-4 border-ink bg-background/92">
      <div className="relative mx-auto grid h-[72px] max-w-7xl grid-cols-3 items-center px-4">
        <Link to="/" className="flex items-center gap-2 justify-self-start">
          <img src="/art/heart.png" alt="" className="pixel size-6" />
          <span className="font-display text-2xl tracking-[0.14em] text-moon">VAULT</span>
        </Link>

        <div className="justify-self-center">
          {mounted && address ? (
            <button
              type="button"
              onClick={() => wallet.disconnect()}
              title="Disconnect"
              className="pixel-panel flex min-w-[220px] flex-col items-center px-5 py-1.5"
            >
              <span className="font-pixel text-[9px] leading-none text-crimson">
                {nickname || "UNNAMED"}
              </span>
              <span className="num mt-1 text-[11px] text-moon">{shortAddress(address)}</span>
            </button>
          ) : mounted ? (
            <WalletConnect />
          ) : (
            <div className="h-10 w-48" />
          )}
        </div>

        <div className="hidden items-center gap-4 justify-self-end sm:flex">
          <div className="text-right">
            <p className="font-pixel text-[8px] text-muted-foreground">NET</p>
            <p className="num text-[10px] text-success">MONAD</p>
          </div>
          <Link to="/arena" className="font-pixel text-[8px] text-moon hover:text-crimson">
            ARENA
          </Link>
        </div>
      </div>

      {mounted && !hasProvider && (
        <p className="border-t-2 border-crimson/40 bg-crimson/10 px-4 py-1 text-center font-mono text-[10px] text-crimson">
          No EVM wallet detected. Install MetaMask to play.
        </p>
      )}
      {mounted && error && (
        <p className="border-t-2 border-crimson/40 bg-crimson/10 px-4 py-1 text-center font-mono text-[10px] text-crimson">
          {error}
        </p>
      )}
    </header>
  );
}
