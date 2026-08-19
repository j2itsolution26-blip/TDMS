"use client";

import { logout } from "@/app/(app)/actions";
import type { SessionUser } from "@/server/session";
import { Breadcrumbs } from "./Breadcrumbs";
import { MenuIcon, ChevronLeftIcon } from "./icons";

export function Topbar({
  user,
  collapsed,
  onToggleCollapsed,
  onToggleMobile,
}: {
  user: SessionUser;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onToggleMobile: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobile}
          aria-label="Open menu"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:block"
        >
          <ChevronLeftIcon className={`h-5 w-5 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
        <Breadcrumbs />
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-slate-800">{user.name}</p>
          <p className="text-xs capitalize text-emerald-700">{user.roles.join(", ").replace(/_/g, " ") || "no role"}</p>
        </div>
        <form action={logout}>
          <button type="submit" className="text-sm font-medium text-slate-500 hover:text-red-600">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
