"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { StaffFormState } from "./actions";

type Action = (prev: StaffFormState, formData: FormData) => Promise<StaffFormState>;

export function StaffForm({
  action,
  assignableRoles,
  defaultValues,
}: {
  action: Action;
  assignableRoles: string[];
  defaultValues?: { name: string; email: string; role: string };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<StaffFormState, FormData>(action, {});

  useEffect(() => {
    // Creating shows the one-time generated password inline instead of
    // navigating away immediately; editing has nothing to reveal, so it
    // returns to the list right away.
    if (state.success && !state.generatedPassword) router.push("/staff");
  }, [state.success, state.generatedPassword, router]);

  return (
    <div className="max-w-lg space-y-4">
      {state.generatedPassword ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-900">Account created</p>
          <p className="mt-1 text-sm text-amber-800">
            One-time password &mdash; save it now, it won&rsquo;t be shown again:
          </p>
          <code className="mt-2 block rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-sm text-slate-900">
            {state.generatedPassword}
          </code>
          <Button className="mt-4" onClick={() => router.push("/staff")}>
            Done
          </Button>
        </div>
      ) : (
        <form action={formAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
          {state.error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}

          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
              Name
            </label>
            <Input id="name" name="name" required maxLength={255} defaultValue={defaultValues?.name} />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <Input id="email" name="email" type="email" required defaultValue={defaultValues?.email} />
          </div>

          <div>
            <label htmlFor="role" className="mb-1 block text-sm font-medium text-slate-700">
              Role
            </label>
            <select
              id="role"
              name="role"
              required
              defaultValue={defaultValues?.role ?? assignableRoles[0]}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700"
            >
              {assignableRoles.map((role) => (
                <option key={role} value={role} className="capitalize">
                  {role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          {!defaultValues && (
            <p className="text-xs text-slate-500">
              A secure password is generated automatically and shown once after saving.
            </p>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.push("/staff")}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
