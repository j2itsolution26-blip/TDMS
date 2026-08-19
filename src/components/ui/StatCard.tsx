type StatTone = "neutral" | "success" | "warning" | "danger";

const VALUE_TONE: Record<StatTone, string> = {
  neutral: "text-ink",
  success: "text-emerald",
  warning: "text-amber-700",
  danger: "text-red-700",
};

const ICON_TONE: Record<StatTone, string> = {
  neutral: "bg-soft-green text-emerald",
  success: "bg-soft-green text-emerald",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: number | string;
  /** Small secondary line under the value, e.g. "of 42 total". */
  hint?: string;
  tone?: StatTone;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(23,53,44,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
        {icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ICON_TONE[tone]}`}>
            {icon}
          </span>
        )}
      </div>
      <p className={`mt-3 text-2xl font-bold ${VALUE_TONE[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
