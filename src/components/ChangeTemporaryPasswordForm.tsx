'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { FieldError } from '@/components/ui';
import { PASSWORD_REQUIREMENTS, evaluatePassword, passwordProblems } from '@/lib/password-policy';

/**
 * Replace a temporary password with a permanent one.
 *
 * The visitor is signed in — this is not part of authentication — but they
 * cannot go anywhere else until they finish: requireUser() sends every
 * protected page here, and requireApiUser() refuses every API route but the
 * one below. The screen is therefore deliberately without a way out, because
 * offering "later" is how a password two people know survives for a year.
 *
 * WHY THE BUTTON IS NEVER DISABLED FOR VALIDATION
 *
 * It used to be: `disabled` unless the temporary password was non-empty, the
 * new password met every rule, and the confirmation matched. Only one of those
 * three had anything on screen, and the disabled style (70% opacity, a
 * "progress" cursor) looked like a live button that was thinking. So a
 * mistyped confirmation — or, most often, a temporary password filled in by
 * the browser's password manager, which Chrome does not hand to page scripts
 * until the user interacts, leaving React's copy empty — produced a button that
 * silently did nothing. No request, no message, no change. That is exactly what
 * was reported, and the audit log confirms no request ever arrived.
 *
 * So now: the button works whenever nothing is in flight; clicking it checks
 * the form and says precisely what is wrong; and the values are read from the
 * form at the moment of submission rather than only from React state, so an
 * autofilled field is submitted as what the user can see.
 */

type FieldName = 'currentPassword' | 'password' | 'passwordConfirmation';
type Values = Record<FieldName, string>;

const EMPTY: Values = { currentPassword: '', password: '', passwordConfirmation: '' };

/** The checks the server repeats. A convenience for the person typing, not the rule. */
function validate(values: Values): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  if (values.currentPassword === '') errors.currentPassword = ['Temporary password is required.'];

  if (values.password === '') {
    errors.password = ['New password is required.'];
  } else {
    const problems = passwordProblems(values.password);
    if (problems.length > 0) errors.password = problems;
  }

  if (values.passwordConfirmation === '') {
    errors.passwordConfirmation = ['Please confirm your new password.'];
  } else if (values.password !== values.passwordConfirmation) {
    errors.passwordConfirmation = ['Passwords do not match.'];
  }

  return errors;
}

/** One sentence summarising what to fix, shown above the button. */
function summarise(errors: Record<string, string[]>): string {
  if (errors.currentPassword) return errors.currentPassword[0]!;
  if (errors.password) {
    return errors.password[0] === 'New password is required.'
      ? errors.password[0]
      : 'Password does not meet the required requirements.';
  }
  if (errors.passwordConfirmation) return errors.passwordConfirmation[0]!;
  return 'Please check the form and try again.';
}

const FIELD_ORDER: FieldName[] = ['currentPassword', 'password', 'passwordConfirmation'];
const FIELD_ID: Record<FieldName, string> = {
  currentPassword: 'current-password',
  password: 'new-password',
  passwordConfirmation: 'confirm-password',
};

export default function ChangeTemporaryPasswordForm({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const router = useRouter();

  const [form, setForm] = useState<Values>(EMPTY);
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * A ref as well as state: two clicks in the same tick both see busy=false,
   * because a state update is not synchronous. The ref is, so a double click
   * sends one request. The server is the real guard — the change is a
   * conditional write that succeeds once — this just spares a pointless error.
   */
  const inFlight = useRef(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    [],
  );

  const requirements = useMemo(() => evaluatePassword(form.password), [form.password]);
  const confirmationTouched = form.passwordConfirmation.length > 0;
  const passwordsMatch = form.password === form.passwordConfirmation;

  function update(field: FieldName, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    // Editing a field clears that field's complaint; the summary goes with it.
    if (errors[field]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
    setMessage(null);
  }

  function focusField(field: FieldName) {
    document.getElementById(FIELD_ID[field])?.focus();
  }

  /** Continue into the app. Replace, not push: Back must not return here. */
  function proceed(to: string) {
    router.replace(to);
    /*
     * The requirement was enforced from the session on every request, so
     * clearing it changes what every server component renders — the router
     * cache has to be dropped or a cached dashboard could still bounce here.
     */
    router.refresh();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || success) return;

    /*
     * Read what is actually in the fields. A password manager can fill an
     * input without React ever being told, so state alone can say "empty"
     * about a field the user can see is filled.
     */
    const fields = event.currentTarget.elements;
    const read = (field: FieldName) =>
      (fields.namedItem(field) as HTMLInputElement | null)?.value ?? form[field];

    const values: Values = {
      currentPassword: read('currentPassword'),
      password: read('password'),
      passwordConfirmation: read('passwordConfirmation'),
    };
    setForm(values);

    const problems = validate(values);
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      setMessage(summarise(problems));
      focusField(FIELD_ORDER.find((f) => problems[f])!);
      return;
    }

    inFlight.current = true;
    setBusy(true);
    setErrors({});
    setMessage(null);

    // Local, not state: state read here would be this render's stale copy.
    let succeeded = false;

    try {
      const result = await api.post<{ message: string; redirectTo: string }>(
        '/api/auth/change-password',
        values,
      );

      if (!result.ok) {
        // Signed out underneath us — the session expired or was ended.
        if (result.status === 401) {
          router.replace('/login');
          return;
        }

        // Already done (a second tab, a repeated click): nothing to fix, just go on.
        if (result.code === 'TEMP_PASSWORD_ALREADY_CHANGED') {
          succeeded = true;
          setSuccess(result.message);
          proceed('/dashboard');
          return;
        }

        const fieldErrors = result.errors ?? {};
        setErrors(fieldErrors);

        /*
         * Always say something. The old form showed the server's message only
         * when there were no field errors, which could leave a failure with
         * nothing on screen at all if the field was not one it rendered.
         *
         * A schema failure arrives as field errors with no code and the
         * generic "The given data was invalid." — summarised here into the
         * sentence that says which. A domain failure ("Temporary password is
         * incorrect.") carries a code and its own message, used as-is.
         */
        setMessage(result.errors && !result.code ? summarise(fieldErrors) : result.message);

        const firstBad = FIELD_ORDER.find((f) => fieldErrors[f]);
        if (firstBad) focusField(firstBad);
        return;
      }

      // Nothing of the passwords lingers in memory once they are accepted.
      succeeded = true;
      setForm(EMPTY);
      setSuccess(result.data.message);

      // Long enough to read the confirmation, short enough not to feel stuck.
      redirectTimer.current = setTimeout(() => proceed(result.data.redirectTo), 1200);
    } finally {
      setBusy(false);
      // After success the form stays locked: there is nothing more to submit.
      if (!succeeded) inFlight.current = false;
    }
  }

  const locked = busy || success !== null;

  return (
    <div>
      <p className="tdms-verify-title">Choose a permanent password</p>
      <p className="tdms-verify-lead">
        {name}, the password you signed in with was issued by the system administrator and is
        temporary. Replace it before continuing.
        <span className="tdms-verify-email">{email}</span>
      </p>

      {success && (
        <div className="tdms-verified" role="status">
          <span className="tdms-verified__mark" aria-hidden="true">
            ✓
          </span>
          <div>
            <p className="tdms-verified__title">{success}</p>
            <p className="tdms-verified__body">Taking you to your dashboard…</p>
          </div>
        </div>
      )}

      {/*
        noValidate: the browser's own "please fill in this field" bubbles are
        replaced by messages that say what is actually wrong. Nothing is
        weakened — every rule is checked below and again on the server.
      */}
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <fieldset disabled={success !== null} className="m-0 min-w-0 border-0 p-0">
          <div className="tdms-field">
            <label htmlFor="current-password">Temporary password</label>
            <div className="tdms-input-wrap">
              <input
                id="current-password"
                name="currentPassword"
                type={reveal ? 'text' : 'password'}
                required
                autoFocus
                autoComplete="current-password"
                placeholder="The password you were given"
                aria-invalid={Boolean(errors.currentPassword)}
                value={form.currentPassword}
                onChange={(e) => update('currentPassword', e.target.value)}
              />
            </div>
            <FieldError messages={errors.currentPassword} />
          </div>

          <div className="tdms-field">
            <label htmlFor="new-password">New password</label>
            <div className="tdms-input-wrap">
              <input
                id="new-password"
                name="password"
                type={reveal ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="Choose a password only you know"
                aria-invalid={Boolean(errors.password)}
                aria-describedby="new-password-requirements"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
              />
            </div>

            {/*
              Built from the same PASSWORD_REQUIREMENTS the server validates
              against, so a password the checklist calls complete is exactly
              one the server accepts.
            */}
            <p className="tdms-requirements-heading" id="new-password-requirements">
              Password requirements
            </p>
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
                name="passwordConfirmation"
                type={reveal ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="Re-enter the new password"
                aria-invalid={Boolean(errors.passwordConfirmation)}
                value={form.passwordConfirmation}
                onChange={(e) => update('passwordConfirmation', e.target.value)}
              />
            </div>

            {/*
              Live, because a mismatch used to be the invisible reason the
              button would not respond.
            */}
            {confirmationTouched && !errors.passwordConfirmation && (
              <p
                className={`tdms-password-match${passwordsMatch ? ' is-met' : ' is-mismatch'}`}
                aria-live="polite"
              >
                <span className="tdms-req-icon" aria-hidden="true">
                  {passwordsMatch ? '✓' : '!'}
                </span>
                {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
              </p>
            )}

            <FieldError messages={errors.passwordConfirmation} />
          </div>

          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            {reveal ? 'Hide passwords' : 'Show passwords'}
          </button>

          {message && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {message}
            </p>
          )}

          <button type="submit" className="tdms-submit" disabled={locked} aria-busy={busy}>
            <span>{busy ? 'Changing password…' : success ? 'Password changed' : 'Set Password'}</span>
          </button>
        </fieldset>
      </form>
    </div>
  );
}
