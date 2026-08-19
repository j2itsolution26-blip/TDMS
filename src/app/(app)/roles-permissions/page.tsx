import { requirePermission } from "@/server/rbac";
import { ROLE_PERMISSIONS } from "@/lib/permissions";

export default async function RolesPermissionsPage() {
  await requirePermission("system.configure");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Roles &amp; Permissions</h1>
        <p className="text-sm text-slate-500">
          The actual authorization matrix enforced by the server — read-only.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => (
          <div key={role} className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold capitalize text-slate-800">{role.replace(/_/g, " ")}</h2>
            <ul className="mt-3 space-y-1.5">
              {permissions.map((permission) => (
                <li key={permission} className="text-sm text-slate-600">
                  {permission}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
