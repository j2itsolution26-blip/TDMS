import Link from "next/link";
import { NAV_ITEMS } from "./navItems";
import { userHasPermission } from "@/server/rbac";
import type { SessionUser } from "@/server/session";

export function Sidebar({ user }: { user: SessionUser }) {
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || userHasPermission(user, item.permission)
  );

  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:block">
      <div className="flex h-16 items-center border-b border-slate-200 px-6">
        <span className="text-sm font-bold text-emerald-800">TDMS</span>
      </div>
      <nav className="space-y-1 p-4">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
