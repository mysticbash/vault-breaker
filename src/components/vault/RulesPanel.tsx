const rules = [
  "Talk to the guardian for free. The key is in the conversation.",
  "Each strike is a real Monad testnet transaction from your wallet.",
  "Three hearts per agent. A miss feeds the pool and the agent.",
  "The exact key drains the full pool on-chain. No referee.",
  "A long strength bar means many players already failed here.",
];

export function RulesPanel() {
  return (
    <aside className="pixel-panel h-fit p-5">
      <h3 className="mb-4 text-2xl tracking-wide text-crimson">RULES</h3>
      <ul className="space-y-3">
        {rules.map((rule, i) => (
          <li key={rule} className="flex gap-3 font-mono text-[11px] leading-relaxed">
            <span className="num text-crimson">{String(i + 1).padStart(2, "0")}</span>
            <p className="text-muted-foreground">{rule}</p>
          </li>
        ))}
      </ul>
      <p className="mt-5 border-2 border-ink bg-background px-3 py-2 text-center font-pixel text-[8px] leading-relaxed text-muted-foreground">
        MONAD TESTNET · 10143
      </p>
    </aside>
  );
}
