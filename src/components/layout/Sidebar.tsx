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
      className={`fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col bg-sidebar-bg transition-all duration-200 md:static md:translate-x-0 ${
        collapsed ? "md:w-[76px]" : "md:w-64"
      } ${mobileOpen ? "translate-x-0" : "-translate-x-full"} w-64`}
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/10 px-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/90 text-sm font-bold text-forest-dark">
          T
        </span>
        {!collapsed && (
          <span className="text-sm font-bold tracking-wide text-white">TDMS</span>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-3">
        {sections.map((section) => (
          <div key={section}>
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
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
                      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-white/10 text-white"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      } ${collapsed ? "md:justify-center" : ""}`}
                    >
                      {active && (
                        <span className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-gold-accent" aria-hidden="true" />
                      )}
                      {Icon && <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-gold-accent" : ""}`} />}
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
