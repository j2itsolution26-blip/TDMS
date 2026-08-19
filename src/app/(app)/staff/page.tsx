import Link from "next/link";
import { requirePermission, userHasRole } from "@/server/rbac";
import { listStaff } from "@/services/staff.service";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StaffRow } from "./StaffRow";

export default async function StaffPage() {
  const actor = await requirePermission("accounts.manage");
  const staff = await listStaff(actor);
  const isSuperAdmin = userHasRole(actor, ["super_admin"]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Staff Accounts</h1>
          <p className="text-sm text-slate-500">
            Manage teacher, staff, and administrator accounts. {staff.length} account(s).
          </p>
        </div>
        <Link href="/staff/new">
          <Button>New Staff Account</Button>
        </Link>
      </div>

      {staff.length === 0 ? (
        <EmptyState title="No staff accounts yet" description="Accounts you create will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {staff.map((member) => (
                <StaffRow
                  key={member.id}
                  id={member.id}
                  name={member.name}
                  email={member.email}
                  role={member.role}
                  isActive={member.isActive}
                  canEdit={member.role === "admin" ? isSuperAdmin : true}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
