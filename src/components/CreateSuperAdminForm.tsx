'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { FieldError } from '@/components/ui';
import { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS, evaluatePassword } from '@/lib/password-policy';
import type { PendingRegistration } from '@/types/domain';

/**
 * The one-time Super Admin setup, as two steps.
 *
 *   1. account details — with the password rules shown live, so nothing is
 *      saved for the sake of being told the password is wrong;
 *   2. verify the institutional email — a six-digit code, typed in this tab.
 *
 * Account creation is a third, explicit action that only appears once the code
 * has been accepted. Nothing here creates an account: this component cannot,
 * because the endpoint that does takes no account details at all — it reads
 * them from the pending registration the server holds against an HttpOnly
 * cookie. See src/server/services/super-admin-service.ts.
 *
 * The step is derived from server state rather than remembered locally, which
 * is what makes a refresh mid-verification harmless: on mount the component
 * asks where it had got to.
 *
 * Every check in here is a courtesy to the person typing. The identical rules
 * run on the server, which is where they are enforced.
 */

const CODE_LENGTH = 6;

/** mm:ss, for the two countdowns. */
function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function CreateSuperAdminForm({
  domain,
  mailProblem,
}: {
  domain: string;
  /**
   * An administrator-facing configuration error, or null when mail is ready.
   * Names environment variables; never their values.
   */
  mailProblem: string | null;
}) {
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirmation: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const [pending, setPending] = useState<PendingRegistration | null>(null);
  const [resuming, setResuming] = useState(true);

  const [code, setCode] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * A ref as well as the state flag: two clicks landing in the same tick both
   * see `busy === false`, because a state update is not synchronous. The ref
   * is, which is what actually makes a double click harmless here. The server
   * refuses a duplicate independently — this only spares the user an error
   * message for something that worked.
   */
  const inFlight = useRef(false);

  const phase: 'details' | 'verify' | 'verified' = !pending
    ? 'details'
    : pending.verified
      ? 'verified'
      : 'verify';

  // --- Live validation of the details step ---------------------------------

  const requirements = useMemo(() => evaluatePassword(form.password), [form.password]);
  const passwordComplete = PASSWORD_REQUIREMENTS.every((r) => requirements[r.id]);

  const confirmationTouched = form.passwordConfirmation.length > 0;
  const passwordsMatch = form.password === form.passwordConfirmation;

  const emailLooksInstitutional = useMemo(() => {
    const value = form.email.trim().toLowerCase();
    const at = value.lastIndexOf('@');
    if (at <= 0) return false;
    return value.slice(at + 1) === domain.toLowerCase() && !/\s/.test(value);
  }, [form.email, domain]);

  const detailsComplete =
    form.name.trim().length > 0 &&
    emailLooksInstitutional &&
    passwordComplete &&
    confirmationTouched &&
    passwordsMatch;

  const codeValue = code.join('');
  const codeComplete = codeValue.length === CODE_LENGTH;

  // --- Resuming, and the countdowns ---------------------------------------

  const refresh = useCallback(async () => {
    const result = await api.get<{ pending: PendingRegistration | null }>(
      '/api/auth/super-admin/pending',
    );
    if (result.ok) setPending(result.data.pending);
    return result.ok ? result.data.pending : null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await api.get<{ pending: PendingRegistration | null }>(
        '/api/auth/super-admin/pending',
      );
      if (cancelled) return;
      if (result.ok && result.data.pending) setPending(result.data.pending);
      setResuming(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * The countdowns run from the seconds the server reported, decremented
   * locally. Counting down from a server-supplied duration rather than from an
   * absolute deadline means a browser clock that is minutes out cannot make an
   * expired code look live.
   */
  const hasPending = pending !== null;

  useEffect(() => {
    if (!hasPending) return;

    const timer = setInterval(() => {
      setPending((current) =>
        current
          ? {
              ...current,
              expiresInSeconds: Math.max(0, current.expiresInSeconds - 1),
              resendInSeconds: Math.max(0, current.resendInSeconds - 1),
              completionInSeconds: Math.max(0, current.completionInSeconds - 1),
            }
          : current,
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [hasPending]);

  /** Focus the first empty box whenever the verification step appears. */
  useEffect(() => {
    if (phase !== 'verify') return;
    const firstEmpty = code.findIndex((d) => d === '');
    codeRefs.current[firstEmpty === -1 ? CODE_LENGTH - 1 : firstEmpty]?.focus();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetFeedback() {
    setErrors({});
    setMessage(null);
    setNotice(null);
  }

  /** Wrap a submission so nothing can be sent twice. */
  async function guard(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // --- Step 1 --------------------------------------------------------------

  async function submitDetails(event: React.FormEvent) {
    event.preventDefault();
    if (!detailsComplete || mailProblem) return;

    await guard(async () => {
      resetFeedback();

      const result = await api.post<PendingRegistration>('/api/auth/super-admin/start', form);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.errors ? null : result.message);
        return;
      }

      setCode(Array(CODE_LENGTH).fill(''));
      setPending(result.data);
      /*
       * The typed password is dropped from component state the moment it has
       * been accepted: the server holds its hash, and there is no reason for
       * the plaintext to sit in memory through the verification step.
       */
      setForm((f) => ({ ...f, password: '', passwordConfirmation: '' }));
    });
  }

  // --- Step 2 --------------------------------------------------------------

  function setDigit(index: number, digit: string) {
    setCode((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });
  }

  /** Spread a pasted or autofilled string across the boxes from `index`. */
  function fillFrom(index: number, raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 0) return;

    setCode((current) => {
      const next = [...current];
      for (let i = 0; i < digits.length && index + i < CODE_LENGTH; i += 1) {
        next[index + i] = digits[i]!;
      }
      return next;
    });

    const landing = Math.min(index + digits.length, CODE_LENGTH - 1);
    codeRefs.current[landing]?.focus();
  }

  function onCodeChange(index: number, value: string) {
    setMessage(null);
    setErrors({});

    // Autofill and fast typing can deliver more than one character at once.
    if (value.length > 1) {
      fillFrom(index, value);
      return;
    }

    const digit = value.replace(/\D/g, '');
    setDigit(index, digit);
    if (digit && index < CODE_LENGTH - 1) codeRefs.current[index + 1]?.focus();
  }

  function onCodeKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      /*
       * Backspace in an empty box steps back and clears the one before it,
       * which is what people expect from a segmented field — otherwise the
       * caret sticks and the key appears to do nothing.
       */
      if (code[index] === '' && index > 0) {
        event.preventDefault();
        setDigit(index - 1, '');
        codeRefs.current[index - 1]?.focus();
      }
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      codeRefs.current[index - 1]?.focus();
    }

    if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault();
      codeRefs.current[index + 1]?.focus();
    }
  }

  function onCodePaste(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    fillFrom(index, event.clipboardData.getData('text'));
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (!codeComplete) return;

    await guard(async () => {
      resetFeedback();

      const result = await api.post<PendingRegistration>('/api/auth/super-admin/verify', {
        code: codeValue,
      });

      if (!result.ok) {
        setMessage(result.message);
        setCode(Array(CODE_LENGTH).fill(''));
        codeRefs.current[0]?.focus();
        // Pick up the attempts and timers the failure just changed. A null
        // answer means the registration is gone, which sends us back to step 1.
        await refresh();
        return;
      }

      setPending(result.data);
    });
  }

  async function resend() {
    await guard(async () => {
      resetFeedback();

      const result = await api.post<PendingRegistration>('/api/auth/super-admin/resend');

      if (!result.ok) {
        setMessage(result.message);
        await refresh();
        return;
      }

      setCode(Array(CODE_LENGTH).fill(''));
      setPending(result.data);
      setNotice('A new code is on its way to your inbox.');
      codeRefs.current[0]?.focus();
    });
  }

  async function startOver() {
    await guard(async () => {
      resetFeedback();
      await api.del('/api/auth/super-admin/pending');
      setPending(null);
      setCode(Array(CODE_LENGTH).fill(''));
    });
  }

  // --- Step 3 --------------------------------------------------------------

  async function createAccount() {
    await guard(async () => {
      resetFeedback();

      const result = await api.post<{ redirectTo: string }>('/api/auth/super-admin');

      if (!result.ok) {
        setMessage(result.message);
        /*
         * The verified registration has a completion window of its own. If it
         * closed while this screen sat open, refreshing returns null and the
         * operator lands back on step 1 with the reason on screen, rather than
         * on a button that will now never work.
         */
        await refresh();
        return;
      }

      /*
       * The session cookie was set on that response, and it changes what every
       * server component renders — so the router cache has to be dropped or
       * the dashboard would paint with the signed-out shell.
       */
      router.push(result.data.redirectTo);
      router.refresh();
    });
  }

  // --- Rendering -----------------------------------------------------------

  const stepNumber = phase === 'details' ? 1 : 2;

  const progress = (
    <ol className="tdms-steps" aria-label="Setup progress">
      <li className={stepNumber === 1 ? 'is-current' : 'is-done'}>
        <span className="tdms-steps__marker" aria-hidden="true">
          {stepNumber === 1 ? '1' : '✓'}
        </span>
        <span className="tdms-steps__label">Account Details</span>
      </li>
      <li className={stepNumber === 2 ? 'is-current' : undefined}>
        <span className="tdms-steps__marker" aria-hidden="true">
          2
        </span>
        <span className="tdms-steps__label">Verify Email</span>
      </li>
    </ol>
  );

  const eyeOpen = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

  const eyeClosed = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.8 9.8 0 0 1 12 4c7 0 11 7 11 7a13.2 13.2 0 0 1-3.16 3.93M6.6 6.6C3.7 8.4 1 12 1 12s4 7 11 7a9.7 9.7 0 0 0 5.4-1.6M1 1l22 22" />
      <path d="M9.5 9.5a3 3 0 0 0 4.24 4.24" />
    </svg>
  );

  if (resuming) {
    return (
      <div>
        {progress}
        <p className="mt-4 text-sm text-slate-500">Loading setup…</p>
      </div>
    );
  }

  // --- Step 1: account details --------------------------------------------

  if (phase === 'details') {
    return (
      <div>
        {progress}

        <p className="mb-4 text-sm text-slate-600">
          This is a one-time setup step, available only while the system has no administrator.
        </p>

        {mailProblem && (
          <div className="tdms-config-error" role="alert">
            <p className="tdms-config-error__title">Email delivery is not configured</p>
            <p>{mailProblem}</p>
            <p className="tdms-config-error__note">
              Setup cannot continue until a verification code can be delivered. No account is
              created while this is unresolved.
            </p>
          </div>
        )}

        <form onSubmit={submitDetails} noValidate>
          <div className="tdms-field">
            <label htmlFor="name">Full Name</label>
            <div className="tdms-input-wrap">
              <input
                id="name"
                type="text"
                required
                autoFocus
                autoComplete="name"
                placeholder="Enter the administrator's name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <FieldError messages={errors.name} />
          </div>

          <div className="tdms-field">
            <label htmlFor="email">Institutional Email</label>
            <div className="tdms-input-wrap">
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                placeholder={`name@${domain}`}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">Must be an @{domain} address.</p>
            <FieldError messages={errors.email} />
          </div>

          <div className="tdms-field">
            <label htmlFor="password">Password</label>
            <div className="tdms-input-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                style={{ paddingRight: '2.75rem' }}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                aria-describedby="password-requirements"
              />
              <button
                type="button"
                className="tdms-toggle-visibility"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? eyeClosed : eyeOpen}
              </button>
            </div>

            {/*
              The checklist updates as the field does, so a password is never
              rejected after the fact for something that could have been shown
              while it was being typed.
            */}
            <p className="tdms-requirements-heading" id="password-requirements">
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
            <label htmlFor="password_confirmation">Confirm Password</label>
            <div className="tdms-input-wrap">
              <input
                id="password_confirmation"
                type={showConfirmation ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="Re-enter the password"
                style={{ paddingRight: '2.75rem' }}
                value={form.passwordConfirmation}
                onChange={(e) => setForm({ ...form, passwordConfirmation: e.target.value })}
              />
              <button
                type="button"
                className="tdms-toggle-visibility"
                onClick={() => setShowConfirmation((v) => !v)}
                aria-label={showConfirmation ? 'Hide password' : 'Show password'}
                aria-pressed={showConfirmation}
              >
                {showConfirmation ? eyeClosed : eyeOpen}
              </button>
            </div>

            {confirmationTouched && (
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

          {message && <p className="mt-2 text-sm text-red-600">{message}</p>}

          {/*
            Labelled for what it will do next. Until every requirement is
            satisfied it reads "Create Super Admin" and is disabled; once the
            details are complete it becomes "Verify Email", which is honest
            about the fact that no account is created by pressing it.
          */}
          <button
            type="submit"
            className="tdms-submit"
            disabled={busy || !detailsComplete || Boolean(mailProblem)}
          >
            <span>
              {busy ? 'Sending code…' : detailsComplete ? 'Verify Email' : 'Create Super Admin'}
            </span>
          </button>

          {!detailsComplete && !busy && (
            <p className="tdms-submit-hint">
              Complete every password requirement to continue. We will email a verification code to
              your institutional address.
            </p>
          )}
        </form>

        <div className="tdms-bootstrap-wrap">
          <Link href="/login" className="tdms-bootstrap-link">
            <span>Back to sign in</span>
          </Link>
        </div>
      </div>
    );
  }

  // --- Step 3: verified, ready to create ----------------------------------

  if (phase === 'verified') {
    return (
      <div>
        {progress}

        <div className="tdms-verified" role="status">
          <span className="tdms-verified__mark" aria-hidden="true">
            ✓
          </span>
          <div>
            <p className="tdms-verified__title">Email verified</p>
            <p className="tdms-verified__body">Your email has been verified successfully.</p>
          </div>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          {pending!.email} is confirmed. Create the Super Admin account to finish setup.
        </p>

        {message && <p className="mt-2 text-sm text-red-600">{message}</p>}

        <button type="button" className="tdms-submit" onClick={createAccount} disabled={busy}>
          <span>{busy ? 'Creating account…' : 'Create Super Admin'}</span>
        </button>
      </div>
    );
  }

  // --- Step 2: verify the email -------------------------------------------

  const expired = pending!.expiresInSeconds === 0;
  const resendReady = pending!.resendInSeconds === 0;
  const resendsLeft = pending!.resendsRemaining;

  return (
    <div>
      {progress}

      <p className="tdms-verify-title">Verify your email</p>
      <p className="tdms-verify-lead">
        We sent a verification code to:
        <span className="tdms-verify-email">{pending!.email}</span>
      </p>

      <form onSubmit={submitCode}>
        <div className="tdms-field">
          <label htmlFor="code-0">Enter the 6-digit code</label>
          <div className="tdms-code-inputs">
            {code.map((digit, index) => (
              <input
                key={index}
                id={`code-${index}`}
                ref={(element) => {
                  codeRefs.current[index] = element;
                }}
                /*
                 * type="text" with a numeric inputMode, not type="number":
                 * a number input brings spinners, accepts "e" and "-", and
                 * silently drops leading zeros — and a code may start with one.
                 */
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                // Lets a phone or password manager offer the emailed code.
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
                value={digit}
                onChange={(e) => onCodeChange(index, e.target.value)}
                onKeyDown={(e) => onCodeKeyDown(index, e)}
                onPaste={(e) => onCodePaste(index, e)}
                disabled={busy}
              />
            ))}
          </div>
          <FieldError messages={errors.code} />
        </div>

        {message && <p className="mt-2 text-sm text-red-600">{message}</p>}
        {notice && !message && <p className="mt-2 text-sm text-slate-700">{notice}</p>}

        <button type="submit" className="tdms-submit" disabled={busy || !codeComplete || expired}>
          <span>{busy ? 'Verifying…' : 'Verify Email'}</span>
        </button>
      </form>

      <div className="tdms-resend">
        <p className="tdms-resend__prompt">Didn&apos;t receive the code?</p>

        <button
          type="button"
          className="tdms-resend__button"
          onClick={resend}
          disabled={busy || !resendReady || resendsLeft === 0}
        >
          Resend Code
        </button>

        {/*
          One line that says what the user is waiting for: the cooldown while
          it runs, then the code's own expiry, then how to recover once it has
          expired.
        */}
        <p className="tdms-resend__timer" aria-live="polite">
          {resendsLeft === 0
            ? 'No more codes can be sent for this registration.'
            : !resendReady
              ? `You can request a new code in ${formatCountdown(pending!.resendInSeconds)}.`
              : expired
                ? 'This code has expired. Request a new one.'
                : `Code expires in ${formatCountdown(pending!.expiresInSeconds)}`}
        </p>

        {pending!.attemptsRemaining < 3 && !expired && (
          <p className="tdms-resend__timer">
            {pending!.attemptsRemaining === 0
              ? 'No attempts left on this code. Request a new one.'
              : `${pending!.attemptsRemaining} attempt${pending!.attemptsRemaining === 1 ? '' : 's'} remaining.`}
          </p>
        )}
      </div>

      <div className="tdms-bootstrap-wrap">
        <button type="button" className="tdms-bootstrap-link" onClick={startOver} disabled={busy}>
          <span>Use a different email</span>
        </button>
      </div>
    </div>
  );
}
