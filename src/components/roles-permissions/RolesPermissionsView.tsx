"use client";

import { useMemo, useState } from "react";
import {
  ROLE_META,
  ROLE_ORDER,
  presentPermission,
  allPermissionKeys,
} from "@/lib/permission-presentation";
import { ROLE_PERMISSIONS, type RoleName } from "@/lib/permissions";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { RoleCard } from "./RoleCard";
import { PermissionsModal } from "./PermissionsModal";
import { MatrixView } from "./MatrixView";
import { CompareRoles } from "./CompareRoles";
import { ROLE_ICONS, SearchIcon } from "./icons";
import { StaffIcon, ShieldIcon, ProgramsIcon } from "@/components/layout/icons";

type ViewMode = "cards" | "matrix" | "compare";

export function RolesPermissionsView() {
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [modalRole, setModalRole] = useState<RoleName | null>(null);

  const totalPermissions = allPermissionKeys().length;
  const administrativeRoleCount = ROLE_ORDER.filter((r) => r !== "student").length;
  const studentRoleCount = ROLE_ORDER.length - administrativeRoleCount;

  const filteredRoles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ROLE_ORDER;
    return ROLE_ORDER.filter((role) => {
      const meta = ROLE_META[role];
      if (meta.label.toLowerCase().includes(q) || meta.description.toLowerCase().includes(q)) return true;
      return ROLE_PERMISSIONS[role].some((permission) => {
        const { label, category } = presentPermission(permission);
        return label.toLowerCase().includes(q) || category.toLowerCase().includes(q) || permission.includes(q);
      });
    });
  }, [query]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-r from-soft-green to-white p-5">
        <nav aria-label="Breadcrumb" className="text-xs font-medium text-ink-muted">
          System / Roles &amp; Permissions
        </nav>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-ink">Roles &amp; Permissions</h1>
            <p className="mt-0.5 text-sm text-ink-soft">
              Review the access structure and authorization policies of the TDMS platform.
            </p>
          </div>
          <span className="rounded-full bg-soft-green px-3 py-1 text-xs font-semibold text-emerald">
            Read-only authorization matrix
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Roles" value={ROLE_ORDER.length} hint="Active system roles" icon={<StaffIcon className="h-4 w-4" />} />
        <StatCard label="Permissions" value={totalPermissions} hint="Configured permissions" icon={<ShieldIcon className="h-4 w-4" />} />
        <StatCard
          label="Administrative Roles"
          value={administrativeRoleCount}
          hint="System-level roles"
          icon={<ProgramsIcon className="h-4 w-4" />}
        />
        <StatCard label="Student Access" value={studentRoleCount} hint="Student role" icon={<StaffIcon className="h-4 w-4" />} />
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(23,53,44,0.04)]">
        <p className="mb-3 text-sm font-semibold text-ink">Role Hierarchy</p>
        <div className="flex flex-wrap items-center gap-2">
          {ROLE_ORDER.map((role, index) => {
            const Icon = ROLE_ICONS[role];
            return (
              <div key={role} className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-app-bg px-3 py-1.5">
                  {Icon && <Icon className="h-3.5 w-3.5 text-emerald" />}
                  <span className="text-xs font-medium text-ink">{ROLE_META[role].label}</span>
                  <span className="text-[10px] text-ink-muted">{ROLE_PERMISSIONS[role].length}</span>
                </div>
                {index < ROLE_ORDER.length - 1 && <span className="text-ink-muted/50">→</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roles or permissions..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-emerald focus:outline-none focus:ring-1 focus:ring-emerald"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {(["cards", "matrix", "compare"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                viewMode === mode ? "bg-forest-deep text-white" : "text-ink-soft hover:bg-app-bg"
              }`}
            >
              {mode === "cards" ? "Role Cards" : mode === "matrix" ? "Matrix View" : "Compare Roles"}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "cards" &&
        (filteredRoles.length === 0 ? (
          <EmptyState title="No roles found" description="Try changing your search." />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredRoles.map((role) => (
              <RoleCard key={role} role={role} onViewPermissions={setModalRole} />
            ))}
          </div>
        ))}

      {viewMode === "matrix" && <MatrixView roles={ROLE_ORDER} />}

      {viewMode === "compare" && <CompareRoles />}

      {modalRole && <PermissionsModal role={modalRole} onClose={() => setModalRole(null)} />}
    </div>
  );
}
