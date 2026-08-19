export type NavItem = {
  id: string;
  label: string;
  href: string;
  section: string;
  /** Permission required to see this item. Omit for items every authenticated user sees. */
  permission?: string;
};

// Mirrors the sidebar's visibility rules in the original Laravel app —
// themselves driven by the same permission checks as the routes they
// link to, so a hidden link is a UX nicety here, never the actual guard.
export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", section: "Overview" },
  {
    id: "programs",
    label: "Programs",
    href: "/programs",
    section: "Administration",
    permission: "programs.manage",
  },
  {
    id: "staff",
    label: "Staff Accounts",
    href: "/staff",
    section: "Administration",
    permission: "accounts.manage",
  },
  {
    id: "audit-logs",
    label: "Audit Logs",
    href: "/audit-logs",
    section: "System",
    permission: "audit-logs.view",
  },
  {
    id: "roles-permissions",
    label: "Roles & Permissions",
    href: "/roles-permissions",
    section: "System",
    permission: "system.configure",
  },
];
