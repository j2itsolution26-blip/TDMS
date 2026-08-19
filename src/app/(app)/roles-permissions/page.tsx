import { requirePermission } from "@/server/rbac";
import { RolesPermissionsView } from "@/components/roles-permissions/RolesPermissionsView";

export default async function RolesPermissionsPage() {
  // Unchanged authorization check — only the presentation below it changed.
  await requirePermission("system.configure");

  return <RolesPermissionsView />;
}
