import { ROLE_META, categoryBreakdown } from "@/lib/permission-presentation";
import { ROLE_PERMISSIONS, type RoleName } from "@/lib/permissions";
import { ROLE_ICONS } from "./icons";

export function RoleCard({
  role,
  onViewPermissions,
}: {
  role: RoleName;
  onViewPermissions: (role: RoleName) => void;
}) {
  const meta = ROLE_META[role];
  const Icon = ROLE_ICONS[role];
  const count = ROLE_PERMISSIONS[role].length;
  const breakdown = categoryBreakdown(role);

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(23,53,44,0.04)] ${
        meta.highestAccess ? "border-emerald/40 ring-1 ring-gold/30" : "border-slate-200/70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              meta.highestAccess ? "bg-forest-deep text-gold-accent" : "bg-soft-green text-emerald"
            }`}
          >
            {Icon && <Icon className="h-5 w-5" />}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-ink">{meta.label}</h3>
            <p className="text-xs text-ink-soft">{meta.description}</p>
          </div>
        </div>
        {meta.highestAccess && (
          <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
            Highest Access
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {breakdown.map(({ category, count: catCount }) => (
          <span key={category} className="rounded-full bg-app-bg px-2.5 py-1 text-[11px] font-medium text-ink-soft">
            {category} · {catCount}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="rounded-full bg-soft-green px-2.5 py-1 text-xs font-semibold text-emerald">
          {count} Permission{count === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => onViewPermissions(role)}
          className="text-sm font-medium text-emerald hover:text-forest-deep"
        >
          View Permissions →
        </button>
      </div>
    </div>
  );
}
