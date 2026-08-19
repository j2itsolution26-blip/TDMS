export function Badge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        active ? "bg-soft-green text-emerald" : "bg-slate-100 text-ink-soft"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}
