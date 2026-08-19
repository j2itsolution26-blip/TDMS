"use client";

import { useActionState, useState } from "react";
import { createInitialSuperAdmin, type SetupState } from "./actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";

const initialState: SetupState = {};

export function SetupForm() {
  const [state, formAction, pending] = useActionState(createInitialSuperAdmin, initialState);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
          Full Name
        </label>
        <Input id="name" name="name" required autoFocus autoComplete="name" placeholder="Enter your full name" />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
          Email
        </label>
        <Input id="email" name="email" type="email" required autoComplete="username" placeholder="Enter your email" />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordRequirements password={password} />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-slate-700">
          Confirm Password
        </label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {confirmPassword.length > 0 && (
          <p className={`mt-1 text-xs ${password === confirmPassword ? "text-emerald-700" : "text-red-600"}`}>
            {password === confirmPassword ? "✓ Passwords match" : "Passwords do not match"}
          </p>
        )}
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create Super Admin"}
      </Button>
    </form>
  );
}
