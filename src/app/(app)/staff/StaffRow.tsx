"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toggleActiveAction, resetPasswordAction } from "./actions";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type PendingConfirmation = "reset" | "toggle" | null;

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
  const router = useRouter();
  const [confirming, setConfirming] = useState<PendingConfirmation>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmReset() {
    setConfirming(null);
    startTransition(async () => {
      const result = await resetPasswordAction(id, {}, new FormData());
      setError(result.error ?? null);
      setGeneratedPassword(result.generatedPassword ?? null);
      router.refresh();
    });
  }

  function confirmToggle() {
    setConfirming(null);
    startTransition(async () => {
      await toggleActiveAction(id);
      router.refresh();
    });
  }

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
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirming("reset")}
              className="font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
            >
              Reset Password
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirming("toggle")}
              className={`disabled:opacity-50 ${
                isActive ? "font-medium text-red-600 hover:text-red-700" : "font-medium text-emerald-700 hover:text-emerald-900"
              }`}
            >
              {isActive ? "Deactivate" : "Activate"}
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">No access</span>
        )}
        {generatedPassword && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-left text-xs text-amber-800">
            New password: <code className="font-mono">{generatedPassword}</code>
          </p>
        )}
        {error && <p className="mt-2 text-left text-xs text-red-600">{error}</p>}
      </td>

      {confirming &&
        // Portalled to document.body — a <tr> can only validly contain
        // <td>/<th>, so a fixed-position overlay can't live inline here.
        createPortal(
          confirming === "reset" ? (
            <ConfirmDialog
              title="Reset password?"
              message={`Issue a new password for ${email}? The current password stops working immediately.`}
              confirmLabel="Reset Password"
              pending={isPending}
              onCancel={() => setConfirming(null)}
              onConfirm={confirmReset}
            />
          ) : (
            <ConfirmDialog
              title={isActive ? "Deactivate this account?" : "Reactivate this account?"}
              message={
                isActive
                  ? `${name} (${email}) will be signed out immediately and won't be able to log in until reactivated.`
                  : `${name} (${email}) will be able to log in again.`
              }
              confirmLabel={isActive ? "Deactivate" : "Activate"}
              tone={isActive ? "danger" : "primary"}
              pending={isPending}
              onCancel={() => setConfirming(null)}
              onConfirm={confirmToggle}
            />
          ),
          document.body
        )}
    </tr>
  );
}
