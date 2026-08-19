"use client";

import { logout } from "@/app/(app)/actions";
import type { SessionUser } from "@/server/session";
import { Breadcrumbs } from "./Breadcrumbs";
import { MenuIcon, ChevronLeftIcon } from "./icons";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

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
  const primaryRole = user.roles[0]?.replace(/_/g, " ") ?? "no role";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobile}
          aria-label="Open menu"
          className="rounded-lg p-1.5 text-ink-soft hover:bg-app-bg md:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden rounded-lg p-1.5 text-ink-soft hover:bg-app-bg md:block"
        >
          <ChevronLeftIcon className={`h-5 w-5 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
        <Breadcrumbs />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden rounded-full bg-soft-green px-2.5 py-1 text-xs font-semibold capitalize text-emerald sm:inline-block">
          {primaryRole}
        </span>

        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-deep text-xs font-bold text-white">
            {initials(user.name) || "?"}
          </span>
          <p className="hidden text-sm font-medium text-ink sm:block">{user.name}</p>
        </div>

        <form action={logout}>
          <button type="submit" className="text-sm font-medium text-ink-soft hover:text-red-600">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
