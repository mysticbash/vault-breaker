import { cn } from "@/lib/utils";

const SEGMENTS = 12;

/** Failed raids against this guardian — a fuller bar means a tougher agent. */
export function StrengthBar({
  failed,
  className,
}: {
  failed: number;
  className?: string;
}) {
  const filled = Math.min(SEGMENTS, Math.max(0, failed));
  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-pixel text-[8px] text-moon">AGENT STRENGTH</span>
        <span className="num text-[10px] text-crimson">{failed} failed raids</span>
      </div>
      <div
        className="flex h-3 gap-px border-2 border-ink bg-ink p-px"
        title={`${failed} failed attempts from players`}
      >
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-full flex-1",
              i < filled
                ? i >= 8
                  ? "bg-crimson"
                  : i >= 4
                    ? "bg-gold"
                    : "bg-moon"
                : "bg-surface-2",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function failedRaids(agent: { active: boolean; totalAttempts: number }): number {
  if (agent.totalAttempts <= 0) return 0;
  return agent.active ? agent.totalAttempts : Math.max(0, agent.totalAttempts - 1);
}
