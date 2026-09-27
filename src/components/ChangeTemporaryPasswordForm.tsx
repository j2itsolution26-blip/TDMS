'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { FieldError } from '@/components/ui';
import { PASSWORD_REQUIREMENTS, evaluatePassword } from '@/lib/password-policy';

/**
 * Replace a temporary password with a permanent one.
 *
 * The visitor is signed in — this is not part of authentication — but they
 * cannot go anywhere else until they finish: requireUser() sends every
 * protected page here, and requireApiUser() refuses every API route but the
 * one below. The screen is therefore deliberately without a way out, because
 * offering "later" is how a password two people know survives for a year.
 *
 * The current password is asked for even though it was typed minutes ago at
 * sign-in. It costs the visitor one field and it means a browser left open on
 * this screen is not a way to take the account over.
 */
export default function ChangeTemporaryPasswordForm({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const router = useRouter();

  const [form, setForm] = useState({
    currentPassword: '',
    password: '',
    passwordConfirmation: '',
  });
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const requirements = useMemo(() => evaluatePassword(form.password), [form.password]);
  const strong = PASSWORD_REQUIREMENTS.every((r) => requirements[r.id]);
  const matches = form.password.length > 0 && form.password === form.passwordConfirmation;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErrors({});
    setMessage(null);

    try {
      const result = await api.post<{ redirectTo: string }>('/api/auth/change-password', form);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.errors ? null : result.message);
        return;
      }

      /*
       * The requirement was enforced from the session on every request, so
       * clearing it changes what every server component renders — the router
       * cache has to be dropped or the dashboard would still bounce back here.
       */
      setForm({ currentPassword: '', password: '', passwordConfirmation: '' });
      router.replace(result.data.redirectTo);
      router.refresh();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="tdms-verify-title">Choose a permanent password</p>
      <p className="tdms-verify-lead">
        {name}, the password you signed in with was issued by the system administrator and is
        temporary. Replace it before continuing.
        <span className="tdms-verify-email">{email}</span>
      </p>

      <form onSubmit={submit}>
        <div className="tdms-field">
          <label htmlFor="current-password">Temporary password</label>
          <div className="tdms-input-wrap">
            <input
              id="current-password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              placeholder="The password you were given"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            />
          </div>
          <FieldError messages={errors.currentPassword} />
        </div>

        <div className="tdms-field">
          <label htmlFor="new-password">New password</label>
          <div className="tdms-input-wrap">
            <input
              id="new-password"
              type={reveal ? 'text' : 'password'}
              required
              autoComplete="new-password"
              placeholder="Choose a password only you know"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          {/*
            The same checklist as every other password field, built from the
            same PASSWORD_REQUIREMENTS the server validates against — so a
            password the checklist calls complete is exactly one the server
            accepts.
          */}
          <p className="tdms-requirements-heading">Password requirements</p>
          <ul className="tdms-password-requirements" aria-live="polite">
            {PASSWORD_REQUIREMENTS.map((requirement) => {
              const met = requirements[requirement.id];
              return (
                <li key={requirement.id} className={met ? 'is-met' : undefined}>
                  <span className="tdms-req-icon" aria-hidden="true">
                    {met ? '✓' : ''}
                  </span>
                  <span>
                    {requirement.label}
                    <span className="sr-only">{met ? ' — met' : ' — not met yet'}</span>
                  </span>
                </li>
              );
            })}
          </ul>

          <FieldError messages={errors.password} />
        </div>

        <div className="tdms-field">
          <label htmlFor="confirm-password">Confirm new password</label>
          <div className="tdms-input-wrap">
            <input
              id="confirm-password"
              type={reveal ? 'text' : 'password'}
              required
              autoComplete="new-password"
              placeholder="Re-enter the new password"
              value={form.passwordConfirmation}
              onChange={(e) => setForm({ ...form, passwordConfirmation: e.target.value })}
            />
          </div>
          <FieldError messages={errors.passwordConfirmation} />
        </div>

        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          {reveal ? 'Hide passwords' : 'Show passwords'}
        </button>

        {message && <p className="mt-2 text-sm text-red-600">{message}</p>}

        <button
          type="submit"
          className="tdms-submit"
          disabled={busy || !strong || !matches || form.currentPassword.length === 0}
        >
          <span>{busy ? 'Saving…' : 'Set Password'}</span>
        </button>
      </form>
    </div>
  );
}
