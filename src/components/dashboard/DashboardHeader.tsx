function greetingWord(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Plain helpers, not called directly in the exported dashboard page
// functions' bodies — see the note on daysAgo() in dashboard/page.tsx
// for why (React's render-purity lint rule).
export function currentGreeting(hour: number): string {
  return greetingWord(hour);
}

export function DashboardHeader({
  name,
  subtitle,
  hour,
  today,
}: {
  name: string;
  subtitle: string;
  hour: number;
  today: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-r from-soft-green to-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">
            {currentGreeting(hour)}, {name.split(" ")[0]}
          </h1>
          <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>
        </div>
        <p className="text-xs font-medium text-ink-muted">{today}</p>
      </div>
    </div>
  );
}
