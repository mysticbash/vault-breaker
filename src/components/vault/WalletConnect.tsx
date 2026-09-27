import { useEffect, useState } from "react";
import { useWallet, watchProvider } from "@/lib/wallet";

export function WalletConnect({ size = "md" }: { size?: "md" | "lg" }) {
  const wallet = useWallet();
  const { connecting, providers } = wallet;
  const [picking, setPicking] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    watchProvider();
  }, []);

  if (!mounted) {
    return <div className={size === "lg" ? "h-14 w-full" : "h-10 w-40"} />;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (providers.length > 1 ? setPicking((v) => !v) : wallet.connect())}
        disabled={connecting}
        className={
          size === "lg"
            ? "pixel-btn w-full py-4 text-sm"
            : "pixel-btn px-4 py-2 text-[10px]"
        }
      >
        {connecting ? "CONNECTING…" : "CONNECT WALLET"}
      </button>
      {picking && providers.length > 1 && (
        <div className="pixel-panel absolute left-0 right-0 top-full z-50 mt-1 p-1">
          {providers.map((p) => (
            <button
              key={p.info.rdns}
              type="button"
              onClick={() => {
                setPicking(false);
                wallet.connect(p.info.rdns);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[11px] hover:bg-surface-2"
            >
              {p.info.icon && <img src={p.info.icon} alt="" className="size-4" />}
              {p.info.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
