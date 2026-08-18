"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction}>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 mb-4">
          {state.error}
        </p>
      )}

      <div className="tdms-field">
        <label htmlFor="email">Username or Email</label>
        <div className="tdms-input-wrap">
          <svg className="tdms-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="username"
            placeholder="Enter your username or email"
          />
        </div>
      </div>

      <div className="tdms-field">
        <label htmlFor="password">Password</label>
        <div className="tdms-input-wrap">
          <svg className="tdms-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            style={{ paddingRight: "2.75rem" }}
          />
          <button
            type="button"
            className="tdms-toggle-visibility"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.9 4.24A9.8 9.8 0 0 1 12 4c7 0 11 7 11 7a13.2 13.2 0 0 1-3.16 3.93M6.6 6.6C3.7 8.4 1 12 1 12s4 7 11 7a9.7 9.7 0 0 0 5.4-1.6M1 1l22 22" />
                <path d="M9.5 9.5a3 3 0 0 0 4.24 4.24" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="tdms-row-between">
        <label className="tdms-remember" htmlFor="remember">
          <input id="remember" name="remember" type="checkbox" />
          Remember me
        </label>
        <a className="tdms-forgot" href="/forgot-password">Forgot Password?</a>
      </div>

      <button type="submit" className="tdms-submit" disabled={pending}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
        </svg>
        {pending ? "Signing In…" : "Sign In"}
      </button>
    </form>
  );
}
