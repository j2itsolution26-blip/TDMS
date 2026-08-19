"use client";

import { useMemo, useState } from "react";
import { ROLE_META, presentPermission, ROLE_ORDER } from "@/lib/permission-presentation";
import { ROLE_PERMISSIONS, type RoleName } from "@/lib/permissions";
import { CheckIcon, DashSmallIcon } from "./icons";

export function CompareRoles() {
  const [roleA, setRoleA] = useState<RoleName>("super_admin");
  const [roleB, setRoleB] = useState<RoleName>("admin");

  const permissions = useMemo(() => {
    const set = new Set<string>([...ROLE_PERMISSIONS[roleA], ...ROLE_PERMISSIONS[roleB]]);
    return Array.from(set).sort((a, b) => presentPermission(a).label.localeCompare(presentPermission(b).label));
  }, [roleA, roleB]);

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(23,53,44,0.04)]">
      <div className="flex flex-wrap items-center gap-3">
        <RoleSelect value={roleA} onChange={setRoleA} />
        <span className="text-sm font-medium text-ink-muted">vs</span>
        <RoleSelect value={roleB} onChange={setRoleB} />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/70">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-app-bg">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Permission
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {ROLE_META[roleA].label}
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {ROLE_META[roleB].label}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {permissions.map((permission) => (
              <tr key={permission} className="hover:bg-app-bg">
                <td className="px-4 py-2.5 text-ink">{presentPermission(permission).label}</td>
                <td className="px-4 py-2.5 text-center">
                  {(ROLE_PERMISSIONS[roleA] as readonly string[]).includes(permission) ? (
                    <CheckIcon className="mx-auto h-4 w-4 text-emerald" />
                  ) : (
                    <DashSmallIcon className="mx-auto h-4 w-4 text-slate-300" />
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {(ROLE_PERMISSIONS[roleB] as readonly string[]).includes(permission) ? (
                    <CheckIcon className="mx-auto h-4 w-4 text-emerald" />
                  ) : (
                    <DashSmallIcon className="mx-auto h-4 w-4 text-slate-300" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: RoleName; onChange: (role: RoleName) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as RoleName)}
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-ink focus:border-emerald focus:outline-none focus:ring-1 focus:ring-emerald"
    >
      {ROLE_ORDER.map((role) => (
        <option key={role} value={role}>
          {ROLE_META[role].label}
        </option>
      ))}
    </select>
  );
}
