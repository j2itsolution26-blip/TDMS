'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthError from '@/components/auth/AuthError';
import PasswordInput from '@/components/auth/PasswordInput';
import { ArrowRightIcon, MailIcon, UserPlusIcon } from '@/components/auth/icons';
import SocialProviders, { type ProviderAvailability } from './SocialProviders';

/**
 * The sign-in form.
 *
 * Authentication is entirely server-side: this posts to POST /api/auth/login,
 * which validates, verifies the password, checks account status, issues the
 * session cookie and says where to go next. The form never decides a role or
 * a destination itself — it follows `redirectTo` from the server (or a local
 * ?redirect= from the middleware).
 *
 * The identifier field is type="text": it accepts a username or an email, so
 * type="email" would reject a bare username before submission.
 */

/**
 * Messages for the ?error= codes the Google callback redirects with.
 *
 * Kept as a map here so the callback never has to put prose in a URL, and so
 * nothing technical reaches the browser: the callback emits a short code and
 * this turns it into a sentence.
 */
function errorMessages(domainNotice: string | null): Record<string, string> {
  return {
  cancelled: 'Google sign-in was cancelled.',
  // Only meaningful when the domain restriction is on; the server supplies
  // the wording so the page never names a domain that is not being enforced.
  wrong_domain: domainNotice ?? 'That Google account cannot be used to access TDMS.',
  google_email_unverified:
    'That Google account has not verified its email address, so it cannot be used to sign in.',
  /*
   * Wording note: these describe a Google self-registration, which has no
   * role and no access until an administrator activates it and assigns one.
   * They deliberately avoid the word "approve" — there is no approval queue
   * anywhere in this system, and copy implying one sends people looking for a
   * screen that does not exist.
   */
  account_created_pending:
    'Your account has been created. An administrator needs to activate it and assign your role before you can sign in.',
  account_pending:
    'Your account is not active yet. An administrator needs to activate it and assign your role before you can sign in.',
  account_inactive: 'Your account is inactive. Please contact the administrator.',
  account_suspended: 'Your account has been suspended. Please contact the administrator.',
  admin_setup_required:
    'Finish setting up your administrator account first: sign in below with your email and temporary password, then enter the access code from the Super Admin.',
  invalid_state: 'That sign-in attempt could not be verified. Please try again.',
  expired: 'That sign-in attempt timed out. Please try again.',
  google_failed: 'Google sign-in failed. Please try again.',
  google_unavailable: 'Google sign-in is not available. Please contact the administrator.',
  };
}

/** These are outcomes, not faults — shown in a calmer tone than an error. */
const INFORMATIONAL = new Set(['account_created_pending', 'account_pending', 'cancelled']);

const CONNECTION_ERROR = "We couldn't connect to the server. Please try again.";
// Only for a 503: the server answered, but its database did not.
const SERVICE_UNAVAILABLE = 'Service temporarily unavailable. Please try again shortly.';
const GENERIC_ERROR = 'Username or password is incorrect.';

const ERROR_ID = 'login-error';

export default function LoginForm({
  uninitialized,
  systemUnavailable = false,
  providers = { microsoft: null, google: null },
  domainNotice = null,
  allowedDomain = null,
}: {
  /** True on a new installation: no account exists until /setup is completed. */
  uninitialized: boolean;
  /** True when the server could not reach the database while rendering. */
  systemUnavailable?: boolean;
  /** The OAuth start route for each provider, or null where not configured. */
  providers?: ProviderAvailability;
  /**
   * The domain restriction message, or null when the restriction is off.
   * Decided on the server, so the page never advertises a rule that is not
   * actually being enforced.
   */
  domainNotice?: string | null;
  /** The enforced domain, or null when the restriction is off. */
  allowedDomain?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const passwordRef = useRef<HTMLInputElement>(null);
  // State updates are asynchronous; this ref closes the gap in which a fast
  // double-click could otherwise send two requests.
  const inFlight = useRef(false);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorCode = searchParams.get('error');
  const messages = errorMessages(domainNotice);
  const callbackMessage = errorCode ? (messages[errorCode] ?? messages.google_failed) : null;
  const callbackIsInfo = errorCode ? INFORMATIONAL.has(errorCode) : false;
  // Set by /setup on success. Says nothing the visitor did not just do.
  const setupComplete = !uninitialized && searchParams.get('setup') === 'complete';
  const [submitting, setSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const busy = submitting || isPending;

  function fail(message: string) {
    setError(message);
    setPassword('');
    passwordRef.current?.focus();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Same-origin credentials so the Set-Cookie on the response is stored.
        credentials: 'same-origin',
        body: JSON.stringify({ identifier, password, remember }),
      });

      const payload = await response.json().catch(() => null);

      /*
       * A 5xx, or a body that is not our JSON envelope (a proxy error page,
       * say), is a server problem, not a wrong password — and its text is
       * never shown, so nothing internal reaches the screen. A 4xx carries a
       * message the API wrote for people (and is deliberately the same for an
       * unknown username and a wrong password).
       */
      if (!payload || response.status >= 500) {
        fail(response.status === 503 ? SERVICE_UNAVAILABLE : CONNECTION_ERROR);
        return;
      }

      if (!response.ok || !payload.success) {
        fail(payload.message ?? GENERIC_ERROR);
        return;
      }

      /*
       * An administrator's password buys the right to enter an access code and
       * nothing else, so this response can mean "one step done" rather than
       * "signed in". In that case ?redirect= is deliberately ignored: there is
       * no session yet, and sending the browser to a protected page would
       * bounce it straight back here.
       */
      const nextStep = payload.data?.stage === 'access_code';

      // The typed password is dropped from state as soon as it has been
      // accepted; the verification step has no use for it.
      setPassword('');

      if (nextStep) {
        startTransition(() => {
          router.push(payload.data?.redirectTo ?? '/login/access-code');
          router.refresh();
        });
        return;
      }

      // Honour ?redirect= from the middleware, but only for local paths —
      // echoing back an absolute URL would make this an open redirect.
      const requested = searchParams.get('redirect');
      const target =
        requested && requested.startsWith('/') && !requested.startsWith('//')
          ? requested
          : (payload.data?.redirectTo ?? '/dashboard');

      startTransition(() => {
        router.push(target);
        // The session cookie changes what every server component renders,
        // so the router cache has to be dropped or the shell stays stale.
        router.refresh();
      });
    } catch {
      fail(CONNECTION_ERROR);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="login-form">
      {(systemUnavailable || callbackMessage || uninitialized || setupComplete) && (
        <div className="panel__status">
          {uninitialized && (
            <AuthError tone="info" title="TDMS has not been initialized yet.">
              No accounts exist yet. Set up the first System Administrator to start using TDMS.
            </AuthError>
          )}
          {setupComplete && (
            <AuthError tone="info" title="Setup complete">
              Sign in with the Super Admin account you just created.
            </AuthError>
          )}
          {systemUnavailable && (
            <AuthError tone="warning" title="Service temporarily unavailable">
              Please try again shortly, or contact an administrator if this persists.
            </AuthError>
          )}
          {callbackMessage && (
            <AuthError tone={callbackIsInfo ? 'info' : 'error'}>{callbackMessage}</AuthError>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} aria-busy={busy}>
        {error && (
          <div className="panel__status">
            <AuthError id={ERROR_ID} title="Unable to sign in">
              {error}
            </AuthError>
          </div>
        )}

        <div className="tdms-field">
          {/* Visually hidden to match the design; the placeholder repeats it. */}
          <label htmlFor="email" className="sr-only">
            Username or email
          </label>
          <div className="tdms-input-wrap">
            <MailIcon className="tdms-input-icon" />
            <input
              id="email"
              name="email"
              type="text"
              required
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Username or email"
              value={identifier}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ERROR_ID : undefined}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>
        </div>

        <div className="tdms-field">
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            placeholder="Password"
            invalid={Boolean(error)}
            describedBy={error ? ERROR_ID : undefined}
            inputRef={passwordRef}
          />
        </div>

        <div className="tdms-row-between">
          <label className="tdms-remember" htmlFor="remember">
            <input
              id="remember"
              name="remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me
          </label>

          <Link className="tdms-forgot" href="/forgot-password">
            Forgot password?
          </Link>
        </div>

        <button type="submit" className="tdms-submit" disabled={busy} aria-busy={busy}>
          {busy ? (
            <>
              <span className="tdms-spinner" aria-hidden="true" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRightIcon />
            </>
          )}
        </button>
      </form>

      <SocialProviders providers={providers} allowedDomain={allowedDomain} />

      {uninitialized && (
        <div className="tdms-bootstrap-wrap">
          <div className="tdms-bootstrap-divider">
            <span>System Initialization</span>
          </div>
          <p className="tdms-bootstrap-label">TDMS has not been initialized yet.</p>
          <Link href="/setup" className="tdms-bootstrap-link">
            <UserPlusIcon />
            <span>Set Up TDMS</span>
          </Link>
        </div>
      )}
    </div>
  );
}
