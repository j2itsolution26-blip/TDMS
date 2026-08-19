import { DashboardShell } from "./DashboardShell";
import { NAV_ITEMS } from "./navItems";
import { userHasPermission } from "@/server/rbac";
import type { SessionUser } from "@/server/session";

export function DashboardLayout({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  // Computed server-side (this file is a Server Component) and handed
  // down as plain data — the client Sidebar has no business importing
  // the server-only rbac/session chain itself.
  const navItems = NAV_ITEMS.filter(
    (item) => !item.permission || userHasPermission(user, item.permission)
  );

  return (
    <DashboardShell user={user} navItems={navItems}>
      {children}
    </DashboardShell>
  );
}
