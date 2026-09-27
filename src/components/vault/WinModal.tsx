import { txLink } from "@/lib/game";

export function WinModal({
  txHash,
  chainId,
  payoutLabel,
  onClose,
}: {
  txHash?: string;
  chainId: number;
  payoutLabel?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background/88 p-6">
      <div className="pixel-panel animate-pop w-full max-w-md p-8 text-center">
        <p className="font-pixel text-[9px] text-gold">VAULT OPEN</p>
        <img
          src="/art/chest.png"
          alt="Treasure chest"
          className="pixel mx-auto mt-4 h-40 w-auto"
        />
        <h2 className="mt-3 font-display text-6xl tracking-tight text-crimson">YOU WON</h2>
        {payoutLabel && <p className="num mt-1 text-lg text-gold">+{payoutLabel} MON</p>}
        {txHash ? (
          <a
            href={txLink(chainId, txHash)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 block break-all font-mono text-[10px] leading-relaxed text-moon underline decoration-crimson/50 underline-offset-4"
          >
            {txHash}
          </a>
        ) : (
          <p className="mt-4 font-pixel text-[9px] text-muted-foreground">won</p>
        )}
        <button type="button" onClick={onClose} className="pixel-btn mt-7 w-full py-3 text-[11px]">
          BACK TO ARENA
        </button>
      </div>
    </div>
  );
}
