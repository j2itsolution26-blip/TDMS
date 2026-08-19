import { notFound } from "next/navigation";
import { requirePermission } from "@/server/rbac";
import { assignableRoles, getStaffMember } from "@/services/staff.service";
import { updateStaffAction } from "../../actions";
import { StaffForm } from "../../StaffForm";

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("accounts.manage");
  const { id: idParam } = await params;
  const id = Number(idParam);

  const member = Number.isInteger(id) ? await getStaffMember(actor, id) : null;
  if (!member) notFound();

  const roles = assignableRoles(actor);
  if (member.role === "admin" && !roles.includes("admin")) {
    // Only a super_admin may edit an admin account — the service layer
    // enforces this on save too, but bail out of rendering the form
    // (with the wrong role list) before that.
    notFound();
  }

  // Only .bind() on an actual "use server" export may cross into a
  // Client Component prop.
  const boundAction = updateStaffAction.bind(null, member.id);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-slate-900">Edit Staff Account</h1>
      <StaffForm
        action={boundAction}
        assignableRoles={member.role === "admin" ? roles : roles.filter((r) => r !== "admin")}
        defaultValues={{ name: member.name, email: member.email, role: member.role }}
      />
    </div>
  );
}
