"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS } from "./icons";
import type { NavItem } from "./navItems";

export function Sidebar({
  navItems,
  collapsed,
  mobileOpen,
  onNavigate,
}: {
  navItems: NavItem[];
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const visibleItems = navItems;

  const sections = Array.from(new Set(visibleItems.map((item) => item.section)));

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200 md:static md:translate-x-0 ${
        collapsed ? "md:w-[76px]" : "md:w-64"
      } ${mobileOpen ? "translate-x-0" : "-translate-x-full"} w-64`}
    >
      <div className="flex h-16 shrink-0 items-center border-b border-slate-200 px-5">
        <span className="text-sm font-bold tracking-wide text-emerald-800">
          {collapsed ? "TD" : "TDMS"}
        </span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto p-3">
        {sections.map((section) => (
          <div key={section}>
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {section}
              </p>
            )}
            <div className="space-y-0.5">
              {visibleItems
                .filter((item) => item.section === section)
                .map((item) => {
                  const Icon = NAV_ICONS[item.id];
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-emerald-50 text-emerald-800"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      } ${collapsed ? "md:justify-center" : ""}`}
                    >
                      {Icon && <Icon className="h-[18px] w-[18px] shrink-0" />}
                      <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
