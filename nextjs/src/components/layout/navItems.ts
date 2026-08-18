export type NavItem = {
  label: string;
  href: string;
  /** Permission required to see this item. Omit for items every authenticated user sees. */
  permission?: string;
};

// Mirrors the sidebar's visibility rules in the Laravel app
// (resources/views/livewire/layout/navigation.blade.php), which are
// themselves driven by the same permission checks as the routes they
// link to — a hidden link is a UX nicety here, never the actual guard.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Programs", href: "/programs", permission: "programs.manage" },
  { label: "Staff Accounts", href: "/staff", permission: "accounts.manage" },
];
