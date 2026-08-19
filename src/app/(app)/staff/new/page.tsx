import { requirePermission } from "@/server/rbac";
import { assignableRoles } from "@/services/staff.service";
import { createStaffAction } from "../actions";
import { StaffForm } from "../StaffForm";

export default async function NewStaffPage() {
  const actor = await requirePermission("accounts.manage");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-slate-900">New Staff Account</h1>
      <StaffForm action={createStaffAction} assignableRoles={assignableRoles(actor)} />
    </div>
  );
}
