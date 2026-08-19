"use client";

import Link from "next/link";
import { useActionState } from "react";
import { toggleActiveAction, resetPasswordAction, type ResetPasswordState } from "./actions";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function StaffRow({
  id,
  name,
  email,
  role,
  isActive,
  canEdit,
}: {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  canEdit: boolean;
}) {
  const [resetState, resetFormAction, resetPending] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction.bind(null, id),
    {}
  );

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 text-sm font-medium text-slate-900">{name}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{email}</td>
      <td className="px-4 py-3 text-sm capitalize text-slate-600">{role.replace(/_/g, " ")}</td>
      <td className="px-4 py-3 text-sm">
        <StatusBadge label={isActive ? "Active" : "Deactivated"} tone={isActive ? "success" : "neutral"} />
      </td>
      <td className="px-4 py-3 text-right text-sm">
        {canEdit ? (
          <div className="flex items-center justify-end gap-3">
            <Link href={`/staff/${id}/edit`} className="font-medium text-emerald-700 hover:text-emerald-900">
              Edit
            </Link>
            <form
              action={resetFormAction}
              onSubmit={(e) => {
                if (!confirm(`Issue a new password for ${email}? The current password stops working immediately.`)) {
                  e.preventDefault();
                }
              }}
            >
              <button type="submit" disabled={resetPending} className="font-medium text-emerald-700 hover:text-emerald-900">
                Reset Password
              </button>
            </form>
            <form
              action={toggleActiveAction.bind(null, id)}
              onSubmit={(e) => {
                const msg = isActive
                  ? `Deactivate ${email}? They'll be signed out and unable to log in.`
                  : `Reactivate ${email}?`;
                if (!confirm(msg)) e.preventDefault();
              }}
            >
              <button
                type="submit"
                className={isActive ? "font-medium text-red-600 hover:text-red-700" : "font-medium text-emerald-700 hover:text-emerald-900"}
              >
                {isActive ? "Deactivate" : "Activate"}
              </button>
            </form>
          </div>
        ) : (
          <span className="text-xs text-slate-400">No access</span>
        )}
        {resetState.generatedPassword && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-left text-xs text-amber-800">
            New password: <code className="font-mono">{resetState.generatedPassword}</code>
          </p>
        )}
        {resetState.error && <p className="mt-2 text-left text-xs text-red-600">{resetState.error}</p>}
      </td>
    </tr>
  );
}
