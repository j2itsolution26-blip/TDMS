import { useEffect, useMemo, useRef, useState } from 'react';
import Link from '@/lib/link';
import { useRouter } from '@/lib/navigation';
import { api, type ApiFailure } from '@/lib/api-client';
import { FieldError } from '@/components/ui';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS,
  evaluatePassword,
} from '@shared/lib/password-policy';

/**
 * Replace a temporary password with a permanent one.
 *
 * The visitor is signed in — this is not part of authentication — but they
 * cannot go anywhere else until they finish: requireUser() sends every
 * protected page here, and requireApiUser() refuses every API route but the
 * two this form calls. There is deliberately no way out, because offering
 * "later" is how a password two people know survives for a year.
 *
 * TWO RULES THIS FORM IS BUILT AROUND, BOTH LEARNED THE HARD WAY
 *
 * 1. A disabled button always says why. Set Password stays disabled until the
 *    temporary password is verified, every requirement is met, the
 *    confirmation matches and the new password differs from the temporary one
 *    — and every one of those has its own indicator, plus a line under the
 *    button naming what is still missing. An earlier version disabled the
 *    button on conditions it did not show, and people clicked a dead button
 *    that looked alive.
 *
 * 2. A failure never looks like a success. If the session ends before the
 *    save — most often because the Super Admin reset the temporary password
 *    while this screen was open, which ends every session — the form says
 *    plainly that the password was NOT changed. An earlier version quietly
 *    navigated to the sign-in page, which looked exactly like a successful
 *    save; the person then tried a "new password" that had never been stored.
 */

type TempStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'error';

interface TempCheck {
  status: TempStatus;
  /** The value the status applies to. A result for older text is ignored. */
  value: string;
  message?: string;
}

/** Something that ends the form: the session is gone, or there is nothing left to do. */
interface Stop {
  tone: 'error' | 'done';
  title: string;
  body: string;
  action: { href: string; label: string };
}

type Values = { currentPassword: string; password: string; passwordConfirmation: string };
const EMPTY: Values = { currentPassword: '', password: '', passwordConfirmation: '' };

/** How long typing must pause before the temporary password is checked. */
const CHECK_DELAY_MS = 700;

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
  const [temp, setTemp] = useState<TempCheck>({ status: 'idle', value: '' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<{ title: string; body: string } | null>(null);
  const [stop, setStop] = useState<Stop | null>(null);

  /*
   * Refs where state would be read stale: a double click lands two handlers in
   * the same tick, and a slow check can answer after the field has changed.
   */
  const inFlight = useRef(false);
  const checkSeq = useRef(0);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    [],
  );

  // --- the four gates -------------------------------------------------------

  const requirements = useMemo(() => evaluatePassword(form.password), [form.password]);
  const strong = PASSWORD_REQUIREMENTS.every((r) => requirements[r.id]);

  const tempVerified = temp.status === 'valid' && temp.value === form.currentPassword;
  const confirmationTouched = form.passwordConfirmation.length > 0;
  const passwordsMatch = confirmationTouched && form.password === form.passwordConfirmation;
  const differsFromTemporary =
    form.password.length > 0 && form.password !== form.currentPassword;

  const ready = tempVerified && strong && passwordsMatch && differsFromTemporary;

  /** What is still missing, in the order the fields appear. Shown under the button. */
  const missing: string[] = [];
  if (!tempVerified) {
    missing.push(
      temp.status === 'checking'
        ? 'checking your temporary password…'
        : temp.status === 'invalid'
          ? 'your temporary password is incorrect'
          : 'enter your temporary password',
    );
  }
  if (!strong) missing.push('meet every password requirement');
  if (form.password.length > 0 && !differsFromTemporary) {
    missing.push('choose a password different from your temporary password');
  }
  if (!passwordsMatch) {
    missing.push(confirmationTouched ? 'make the two new passwords match' : 'confirm your new password');
  }

  // --- things that end the form --------------------------------------------

  /**
   * Turn a failure that means "you cannot continue here" into a clear stop.
   * Returns true when it handled the failure.
   */
  function stopFor(failure: ApiFailure): boolean {
    if (failure.status === 401 || failure.code === 'TEMP_PASSWORD_SUPERSEDED') {
      setStop({
        tone: 'error',
        title: 'Your password was NOT changed',
        body:
          failure.code === 'TEMP_PASSWORD_SUPERSEDED'
            ? failure.message
            : 'Your session ended before the new password could be saved. This happens when the system administrator resets your temporary password or your session expires. Sign in again with your current temporary password — ask the administrator if you do not have it.',
        action: { href: '/login', label: 'Sign in again' },
      });
      return true;
    }

    if (failure.code === 'ACCOUNT_SUSPENDED' || failure.code === 'ACCOUNT_NOT_ACTIVE') {
      setStop({
        tone: 'error',
        title: 'Your password was NOT changed',
        body: failure.message,
        action: { href: '/login', label: 'Back to sign in' },
      });
      return true;
    }

    // Finished in another tab, or a repeated click: nothing to fix, just move on.
    if (failure.code === 'TEMP_PASSWORD_ALREADY_CHANGED') {
      setStop({
        tone: 'done',
        title: 'Your password has already been changed',
        body: 'Continue to your dashboard. From now on, sign in with your permanent password.',
        action: { href: '/dashboard', label: 'Continue' },
      });
      return true;
    }

    return false;
  }

  // --- the live temporary-password check -----------------------------------

  async function checkTemporary(value: string) {
    if (checkTimer.current) clearTimeout(checkTimer.current);

    // Every temporary password meets the policy, so a shorter one cannot be
    // right — and checking half-typed text would spend a check for nothing.
    if (value.length < PASSWORD_MIN_LENGTH) {
      setTemp({ status: value.length === 0 ? 'idle' : 'invalid', value, message: value ? 'Incorrect temporary password.' : undefined });
      return;
    }

    const seq = ++checkSeq.current;
    setTemp({ status: 'checking', value });

    const result = await api.post<{ valid: boolean; message: string }>(
      '/api/v1/auth/change-password/verify',
      { currentPassword: value },
    );

    // The field changed while this was in flight; its own check will answer.
    if (seq !== checkSeq.current) return;

    if (result.ok) {
      setTemp({ status: result.data.valid ? 'valid' : 'invalid', value, message: result.data.message });
      return;
    }

    if (stopFor(result)) return;
    setTemp({ status: 'error', value, message: result.message });
  }

  function scheduleCheck(value: string) {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (value.length < PASSWORD_MIN_LENGTH) {
      // Nothing to check yet; clear any verdict that applied to older text.
      setTemp({ status: 'idle', value });
      return;
    }
    setTemp({ status: 'idle', value });
    checkTimer.current = setTimeout(() => void checkTemporary(value), CHECK_DELAY_MS);
  }

  function update(field: keyof Values, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
    setMessage(null);
    if (field === 'currentPassword') scheduleCheck(value);
  }

  /**
   * On leaving the field, check straight away — and read the field itself: a
   * browser can fill a password without React being told, so the visible value
   * is the one to trust.
   */
  function onTemporaryBlur(event: React.FocusEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    if (value !== form.currentPassword) setForm((current) => ({ ...current, currentPassword: value }));
    if (!(temp.value === value && (temp.status === 'valid' || temp.status === 'invalid' || temp.status === 'checking'))) {
      void checkTemporary(value);
    }
  }

  // --- submission ------------------------------------------------------------

  function proceed(to: string) {
    router.replace(to);
    // The requirement is enforced from the session on every request, so the
    // data on screen must be reloaded or the dashboard could bounce here.
    router.refresh();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || success || stop) return;

    // Belt and braces: the button is disabled until ready, but Enter in a field
    // or a stale render should still get an explanation, never silence.
    if (!ready) {
      setMessage(`To continue, ${missing.join(', ')}.`);
      return;
    }

    inFlight.current = true;
    setBusy(true);
    setErrors({});
    setMessage(null);
    let succeeded = false;

    try {
      const result = await api.post<{ message: string; detail: string; redirectTo: string }>(
        '/api/v1/auth/change-password',
        form,
      );

      if (!result.ok) {
        if (stopFor(result)) {
          succeeded = true; // the form is finished either way; keep it locked
          return;
        }

        setErrors(result.errors ?? {});
        setMessage(result.message);

        // The server re-verified the temporary password and disagreed.
        if (result.code === 'TEMP_PASSWORD_INCORRECT') {
          setTemp({ status: 'invalid', value: form.currentPassword, message: 'Incorrect temporary password.' });
        }
        return;
      }

      succeeded = true;
      setForm(EMPTY);
      setSuccess({ title: result.data.message, body: result.data.detail });
      // Long enough to read, short enough not to feel stuck.
      redirectTimer.current = setTimeout(() => proceed(result.data.redirectTo), 1500);
    } finally {
      setBusy(false);
      if (!succeeded) inFlight.current = false;
    }
  }

  // --- rendering -------------------------------------------------------------

  const locked = busy || success !== null || stop !== null;

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
            <p className="tdms-verified__title">{success.title}</p>
            <p className="tdms-verified__body">{success.body} Taking you to your dashboard…</p>
          </div>
        </div>
      )}

      {stop && (
        <div className={stop.tone === 'done' ? 'tdms-verified' : 'tdms-config-error'} role="alert">
          <div>
            <p className={stop.tone === 'done' ? 'tdms-verified__title' : 'tdms-config-error__title'}>
              {stop.title}
            </p>
            <p className={stop.tone === 'done' ? 'tdms-verified__body' : undefined}>{stop.body}</p>
            <p className="mt-2">
              <Link href={stop.action.href} className="font-semibold underline">
                {stop.action.label}
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Our own messages replace the browser's validation bubbles. */}
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <fieldset disabled={success !== null || stop !== null} className="m-0 min-w-0 border-0 p-0">
          <div className="tdms-field">
            <label htmlFor="current-password">Temporary password</label>
            <div className="tdms-input-wrap">
              <input
                id="current-password"
                name="currentPassword"
                type={reveal ? 'text' : 'password'}
                required
                autoFocus
                /*
                 * "one-time-code", not "current-password": this field must hold
                 * the password the administrator JUST issued. A saved password
                 * for this site — an older temporary one, or another account's
                 * — is the wrong answer by definition, and a browser offering
                 * it here is how a correct-looking field fails.
                 */
                autoComplete="one-time-code"
                placeholder="The password you were given"
                aria-invalid={temp.status === 'invalid'}
                aria-describedby="current-password-status"
                value={form.currentPassword}
                onChange={(e) => update('currentPassword', e.target.value)}
                onBlur={onTemporaryBlur}
              />
            </div>

            <p id="current-password-status" aria-live="polite">
              {tempVerified && (
                <span className="tdms-password-match is-met">
                  <span className="tdms-req-icon" aria-hidden="true">✓</span>
                  Temporary password verified.
                </span>
              )}
              {temp.status === 'invalid' && temp.value === form.currentPassword && form.currentPassword !== '' && (
                <span className="tdms-password-match is-mismatch">
                  <span className="tdms-req-icon" aria-hidden="true">✕</span>
                  Incorrect temporary password.
                </span>
              )}
              {temp.status === 'checking' && (
                <span className="tdms-password-match">
                  <span className="tdms-req-icon" aria-hidden="true" />
                  Checking…
                </span>
              )}
              {temp.status === 'error' && (
                <span className="tdms-password-match is-mismatch">
                  <span className="tdms-req-icon" aria-hidden="true">!</span>
                  {temp.message}
                </span>
              )}
            </p>
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
              <li className={differsFromTemporary ? 'is-met' : undefined}>
                <span className="tdms-req-icon" aria-hidden="true">
                  {differsFromTemporary ? '✓' : ''}
                </span>
                <span>
                  Different from your temporary password
                  <span className="sr-only">{differsFromTemporary ? ' — met' : ' — not met yet'}</span>
                </span>
              </li>
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
                value={form.passwordConfirmation}
                onChange={(e) => update('passwordConfirmation', e.target.value)}
              />
            </div>

            {confirmationTouched && (
              <p
                className={`tdms-password-match${passwordsMatch ? ' is-met' : ' is-mismatch'}`}
                aria-live="polite"
              >
                <span className="tdms-req-icon" aria-hidden="true">
                  {passwordsMatch ? '✓' : '✕'}
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

          <button
            type="submit"
            className="tdms-submit"
            disabled={locked || !ready}
            aria-busy={busy}
            aria-describedby="set-password-hint"
          >
            <span>{busy ? 'Updating password…' : success ? 'Password updated' : 'Set Password'}</span>
          </button>

          {/* A disabled button always says why. */}
          {!ready && !locked && (
            <p className="tdms-submit-hint" id="set-password-hint">
              To continue: {missing.join(' · ')}.
            </p>
          )}
        </fieldset>
      </form>
    </div>
  );
}
