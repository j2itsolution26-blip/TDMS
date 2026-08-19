"use client";

import { useEffect } from "react";
import { ROLE_META, presentPermission, type PermissionCategory } from "@/lib/permission-presentation";
import { ROLE_PERMISSIONS, type RoleName } from "@/lib/permissions";
import { ROLE_ICONS, CheckIcon, XIcon } from "./icons";

export function PermissionsModal({ role, onClose }: { role: RoleName; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = ROLE_META[role];
  const Icon = ROLE_ICONS[role];

  const byCategory = new Map<PermissionCategory, string[]>();
  for (const permission of ROLE_PERMISSIONS[role]) {
    const { category, label } = presentPermission(permission);
    byCategory.set(category, [...(byCategory.get(category) ?? []), label]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-dark/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${meta.label} permissions`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-soft-green text-emerald">
              {Icon && <Icon className="h-5 w-5" />}
            </span>
            <div>
              <h3 className="text-base font-semibold text-ink">{meta.label}</h3>
              <p className="text-xs text-ink-soft">{meta.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-app-bg hover:text-ink"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {Array.from(byCategory.entries()).map(([category, labels]) => (
            <div key={category}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{category}</p>
              <ul className="mt-2 space-y-1.5">
                {labels.map((label) => (
                  <li key={label} className="flex items-center gap-2 text-sm text-ink">
                    <CheckIcon className="h-4 w-4 shrink-0 text-emerald" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-ink-muted">
          Read-only view. This reflects the authorization matrix enforced by the server.
        </p>
      </div>
    </div>
  );
}
