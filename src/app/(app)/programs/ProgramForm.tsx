"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { ProgramFormState } from "./actions";

type Action = (prev: ProgramFormState, formData: FormData) => Promise<ProgramFormState>;

export function ProgramForm({
  action,
  defaultValues,
}: {
  action: Action;
  defaultValues?: { code: string; name: string; description: string; isActive: boolean };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ProgramFormState, FormData>(action, {});

  useEffect(() => {
    if (state.success) router.push("/programs");
  }, [state.success, router]);

  return (
    <form action={formAction} className="max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="code" className="mb-1 block text-sm font-medium text-slate-700">
          Code
        </label>
        <Input id="code" name="code" required maxLength={50} defaultValue={defaultValues?.code} />
      </div>

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
          Name
        </label>
        <Input id="name" name="name" required maxLength={255} defaultValue={defaultValues?.name} />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-slate-700">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={defaultValues?.description}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={defaultValues?.isActive ?? true}
          className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
        />
        Active
      </label>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/programs")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
