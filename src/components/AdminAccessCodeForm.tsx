'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { FieldError } from '@/components/ui';

/**
 * Administrator Verification — the second step of an Admin sign-in.
 *
 * The password has been accepted and NOTHING has been granted. What this
 * browser holds is an HttpOnly cookie naming one half-finished sign-in, which
 * authorises exactly one thing: submitting an access code a Super Admin
 * issued separately.
 *
 * Everything on screen is fetched from the server, because the component
 * cannot read that cookie and has no other source of truth. There is no user
 * id in the page, no role, no code, and no hash — the only identity shown is
 * the email address the visitor typed a password for a moment ago.
 *
 * The static Super Admin security code is a different secret entirely and is
 * never mentioned here, let alone accepted: it is for privileged Super Admin
 * operations, and letting it stand in for an Admin's access code would
 * collapse the two into a shared password.
 */

const CODE_LENGTH = 6;

interface Challenge {
  email: string;
  codeExpiresInSeconds: number | null;
  attemptsRemaining: number;
  challengeExpiresInSeconds: number;
  canRequestNewCode: boolean;
  codeLength: number;
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export default function AdminAccessCodeForm() {
  const router = useRouter();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const inFlight = useRef(false);

  const codeValue = code.join('');
  const complete = codeValue.length === CODE_LENGTH;

  /*
   * Countdowns tick down locally from seconds the server supplied, rather
   * than being computed from an absolute expiry against the browser's clock.
   * A machine whose clock is wrong would otherwise show a live code as dead,
   * or a dead one as live.
   */
  const [codeSeconds, setCodeSeconds] = useState<number | null>(null);
  const [challengeSeconds, setChallengeSeconds] = useState(0);

  const load = useCallback(async () => {
    const result = await api.get<{ challenge: Challenge | null }>('/api/auth/admin-access-code');
    if (!result.ok) return null;
    return result.data.challenge;
  }, []);

  /** Refresh the server's view of the challenge after anything changes it. */
  const refresh = useCallback(async () => {
    const next = await load();
    setChallenge(next);
    setCodeSeconds(next?.codeExpiresInSeconds ?? null);
    setChallengeSeconds(next?.challengeExpiresInSeconds ?? 0);
    return next;
  }, [load]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const next = await load();
      if (cancelled) return;

      /*
       * Nothing in progress — an expired challenge, a cleared cookie, or a
       * direct visit to this URL. Back to the password screen, which is the
       * only place a new challenge can come from.
       */
      if (!next) {
        router.replace('/login');
        return;
      }

      setChallenge(next);
      setCodeSeconds(next.codeExpiresInSeconds);
      setChallengeSeconds(next.challengeExpiresInSeconds);
      setLoading(false);
      inputs.current[0]?.focus();
    })();

    return () => {
      cancelled = true;
    };
  }, [load, router]);

  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => {
      setCodeSeconds((s) => (s === null ? null : Math.max(0, s - 1)));
      setChallengeSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  // --- The segmented code field --------------------------------------------

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

    inputs.current[Math.min(index + digits.length, CODE_LENGTH - 1)]?.focus();
  }

  function onChange(index: number, value: string) {
    setMessage(null);
    setErrors({});

    // Autofill and fast typing can deliver more than one character at once.
    if (value.length > 1) {
      fillFrom(index, value);
      return;
    }

    const digit = value.replace(/\D/g, '');
    setDigit(index, digit);
    if (digit && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function onKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      // Backspace in an empty box steps back and clears the one before it,
      // which is what a segmented field is expected to do.
      if (code[index] === '' && index > 0) {
        event.preventDefault();
        setDigit(index - 1, '');
        inputs.current[index - 1]?.focus();
      }
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  }

  function onPaste(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    fillFrom(index, event.clipboardData.getData('text'));
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

  // --- Actions -------------------------------------------------------------

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    await guard(async () => {
      setErrors({});
      setMessage(null);
      setNotice(null);

      const result = await api.post<{ redirectTo: string }>('/api/auth/admin-access-code', {
        code: codeValue,
      });

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.errors ? null : result.message);
        setCode(Array(CODE_LENGTH).fill(''));

        /*
         * Pick up the attempt count and the code state this failure just
         * changed. A null answer means the challenge is gone, which sends the
         * visitor back to the password screen rather than leaving them typing
         * into something that can never succeed.
         */
        const next = await refresh();
        if (!next) {
          router.replace('/login');
          return;
        }

        inputs.current[0]?.focus();
        return;
      }

      /*
       * A session now exists, and it changes what every server component
       * renders — so the router cache has to be dropped or the destination
       * paints with the signed-out shell.
       */
      router.replace(result.data.redirectTo);
      router.refresh();
    });
  }

  async function requestNewCode() {
    await guard(async () => {
      setErrors({});
      setMessage(null);
      setNotice(null);

      const result = await api.post<{ notified: boolean; detail?: string }>(
        '/api/auth/admin-access-code/request',
      );

      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      setNotice(
        result.data.notified
          ? 'The system administrator has been told you need a new code. They will pass it on to you.'
          : (result.data.detail ??
            'Your request has been recorded. Please contact the system administrator for a new code.'),
      );
    });
  }

  async function useDifferentAccount() {
    await guard(async () => {
      await api.del('/api/auth/admin-access-code');
      router.replace('/login');
      router.refresh();
    });
  }

  if (loading || !challenge) {
    return (
      <div className="panel__status">
        <p className="text-sm text-slate-600">Checking your sign-in…</p>
      </div>
    );
  }

  const hasLiveCode = codeSeconds !== null && codeSeconds > 0;

  return (
    <div>
      <p className="tdms-verify-title">Administrator verification</p>
      <p className="tdms-verify-lead">
        Your administrator account needs an access code from the system administrator.
        <span className="tdms-verify-email">{challenge.email}</span>
      </p>

      <form onSubmit={submit}>
        <div className="tdms-field">
          <label htmlFor="access-code-0">Enter your {CODE_LENGTH}-digit access code</label>
          <div className="tdms-code-inputs">
            {code.map((digit, index) => (
              <input
                key={index}
                id={`access-code-${index}`}
                ref={(element) => {
                  inputs.current[index] = element;
                }}
                /*
                 * type="text" with a numeric inputMode, not type="number": a
                 * number input brings spinners, accepts "e" and "-", and
                 * silently drops leading zeros — and a code may start with one.
                 */
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
                value={digit}
                onChange={(e) => onChange(index, e.target.value)}
                onKeyDown={(e) => onKeyDown(index, e)}
                onPaste={(e) => onPaste(index, e)}
                disabled={busy}
              />
            ))}
          </div>
          <FieldError messages={errors.code} />
        </div>

        {message && <p className="mt-2 text-sm text-red-600">{message}</p>}
        {notice && !message && <p className="mt-2 text-sm text-slate-700">{notice}</p>}

        <button type="submit" className="tdms-submit" disabled={busy || !complete}>
          <span>{busy ? 'Verifying…' : 'Verify Access Code'}</span>
        </button>
      </form>

      <div className="tdms-resend">
        {/*
          One line saying what the visitor is waiting for: the live code's
          expiry, or how to recover once it has gone.
        */}
        <p className="tdms-resend__timer" aria-live="polite">
          {hasLiveCode
            ? `Code expires in ${formatCountdown(codeSeconds!)}`
            : codeSeconds === null
              ? 'No access code has been issued for your account yet.'
              : 'That access code has expired. Ask for a new one.'}
        </p>

        {hasLiveCode && challenge.attemptsRemaining < 3 && (
          <p className="tdms-resend__timer">
            {challenge.attemptsRemaining === 0
              ? 'No attempts left on this code. Ask for a new one.'
              : `${challenge.attemptsRemaining} attempt${
                  challenge.attemptsRemaining === 1 ? '' : 's'
                } remaining.`}
          </p>
        )}

        <p className="tdms-resend__prompt">Need a new code?</p>

        <button
          type="button"
          className="tdms-resend__button"
          onClick={requestNewCode}
          disabled={busy}
        >
          Request New Access Code
        </button>

        {/*
          Said plainly, because a button that looks like it produces a code and
          instead sends a message is worse than no button. Only a Super Admin
          can issue one — an account able to mint its own second factor does
          not have one.
        */}
        <p className="tdms-resend__timer">
          This asks the system administrator to issue one. It cannot create a code itself.
          {!challenge.canRequestNewCode &&
            ' Email is not configured on this deployment, so contact them directly.'}
        </p>

        <p className="tdms-resend__timer">
          This sign-in expires in {formatCountdown(challengeSeconds)}.
        </p>
      </div>

      <div className="tdms-bootstrap-wrap">
        <button
          type="button"
          className="tdms-bootstrap-link"
          onClick={useDifferentAccount}
          disabled={busy}
        >
          <span>Sign in as someone else</span>
        </button>
      </div>
    </div>
  );
}
