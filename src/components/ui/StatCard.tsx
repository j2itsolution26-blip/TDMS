type StatTone = "neutral" | "success" | "warning" | "danger";

const TONE_STYLES: Record<StatTone, string> = {
  neutral: "text-slate-900",
  success: "text-emerald-700",
  warning: "text-amber-700",
  danger: "text-red-700",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  /** Small secondary line under the value, e.g. "of 42 total". */
  hint?: string;
  tone?: StatTone;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${TONE_STYLES[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
