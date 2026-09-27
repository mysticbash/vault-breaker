import { cn } from "@/lib/utils";
import { attackerBadge, defenderBadge, tierStars, type Badge } from "@/lib/game";

const tierStyles: Record<Badge["tier"], string> = {
  none: "border-border bg-surface-2 text-muted-foreground",
  bronze: "border-[#b06f35]/60 bg-[#b06f35]/15 text-[#d9925a]",
  silver: "border-[#9aa4b2]/60 bg-[#9aa4b2]/15 text-[#c3ccda]",
  gold: "border-[#e3b341]/70 bg-[#e3b341]/15 text-[#e8c25a]",
  mythic: "border-[#c084fc]/70 bg-[#c084fc]/15 text-[#d8b4fe]",
};

const tierGlows: Record<Badge["tier"], string> = {
  none: "",
  bronze: "shadow-[0_0_12px_-2px_#b06f35aa]",
  silver: "shadow-[0_0_12px_-2px_#9aa4b2aa]",
  gold: "shadow-[0_0_16px_-2px_#e3b341cc]",
  mythic: "shadow-[0_0_20px_-2px_#c084fccc]",
};

export function BadgeChip({ badge, className }: { badge: Badge; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]",
        tierStyles[badge.tier],
        tierGlows[badge.tier],
        className,
      )}
      title={badge.nextAt ? `${badge.nextAt - 0} more to next rank` : "max rank"}
    >
      <span className="text-xs leading-none">{badge.glyph}</span>
      {badge.title}
    </span>
  );
}

export function AttackerBadge({ cracks, className }: { cracks: number; className?: string }) {
  const b = attackerBadge(cracks);
  return className ? <BadgeChip badge={b} className={className} /> : <BadgeChip badge={b} />;
}

export function DefenderBadge({ survivals, className }: { survivals: number; className?: string }) {
  const b = defenderBadge(survivals);
  return className ? <BadgeChip badge={b} className={className} /> : <BadgeChip badge={b} />;
}

export function TierStars({ survivals }: { survivals: number }) {
  const tier = survivals >= 10 ? "LEGENDARY" : survivals >= 3 ? "VETERAN" : "ROOKIE";
  return (
    <span
      className={cn(
        "num text-[11px] font-bold tracking-widest",
        tier === "LEGENDARY" ? "text-legendary" : tier === "VETERAN" ? "text-veteran" : "text-rookie",
      )}
    >
      {tierStars(tier)}
    </span>
  );
}

/** HP hearts — attempts the player has left against this agent. */
export function Lives({
  remaining,
  total = 3,
  center = false,
  size = 22,
}: {
  remaining: number;
  total?: number;
  center?: boolean;
  size?: number;
}) {
  return (
    <div
      className={cn("flex items-center gap-1", center && "justify-center")}
      title={`${remaining} of ${total} lives`}
    >
      {Array.from({ length: total }).map((_, i) => (
        <img
          key={i}
          src="/art/heart.png"
          alt=""
          width={size}
          height={size}
          className={cn("pixel transition-opacity", i < remaining ? "opacity-100" : "opacity-20 grayscale")}
        />
      ))}
    </div>
  );
}
