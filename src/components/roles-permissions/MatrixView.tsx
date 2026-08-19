import { ROLE_META, presentPermission, allPermissionKeys } from "@/lib/permission-presentation";
import { ROLE_PERMISSIONS, type RoleName } from "@/lib/permissions";
import { CheckIcon, DashSmallIcon } from "./icons";

export function MatrixView({ roles }: { roles: RoleName[] }) {
  const permissions = allPermissionKeys().sort((a, b) =>
    presentPermission(a).label.localeCompare(presentPermission(b).label)
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(23,53,44,0.04)]">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-app-bg">
          <tr>
            <th className="sticky left-0 bg-app-bg px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Permission
            </th>
            {roles.map((role) => (
              <th key={role} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {ROLE_META[role].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {permissions.map((permission) => (
            <tr key={permission} className="hover:bg-app-bg">
              <td className="sticky left-0 bg-white px-4 py-2.5 text-ink">
                {presentPermission(permission).label}
              </td>
              {roles.map((role) => {
                const granted = (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
                return (
                  <td key={role} className="px-4 py-2.5 text-center">
                    {granted ? (
                      <CheckIcon className="mx-auto h-4 w-4 text-emerald" />
                    ) : (
                      <DashSmallIcon className="mx-auto h-4 w-4 text-slate-300" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
