'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

/**
 * Port of resources/views/livewire/pages/auth/login.blade.php.
 *
 * The markup is the Blade template's, unchanged: same wrapper classes, same
 * field order, same inline SVGs, same labels ("Username or Email",
 * "Password", "Remember me", "Forgot Password?", "Sign In"), same
 * show/hide password toggle, same loading copy ("Signing In…").
 *
 * Two mechanical differences, both forced by leaving Livewire behind:
 *   * wire:model becomes React state;
 *   * wire:submit becomes a fetch to POST /api/auth/login.
 *
 * The input is type="text", not type="email". Under Laravel it was
 * type="email", which made the browser reject a bare username before the
 * form could even submit — the field has always been labelled "Username or
 * Email", so type="text" is what the label has always promised. It renders
 * identically.
 */
export default function LoginForm({
  canBootstrap,
  systemUnavailable = false,
}: {
  canBootstrap: boolean;
  /** True when the server could not reach the database while rendering. */
  systemUnavailable?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const busy = submitting || isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setError(payload.message ?? 'Invalid username/email or password.');
        setPassword('');
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
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="panel__status">
        {systemUnavailable && (
          <p className="text-sm text-amber-700">
            The system is temporarily unavailable. Please try again shortly, or contact an
            administrator if this persists.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit}>
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
              type="text"
              required
              autoFocus
              autoComplete="username"
              placeholder="Enter your username or email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>
          {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
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
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              style={{ paddingRight: '2.75rem' }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="tdms-toggle-visibility"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {!showPassword && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
              {showPassword && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.9 4.24A9.8 9.8 0 0 1 12 4c7 0 11 7 11 7a13.2 13.2 0 0 1-3.16 3.93M6.6 6.6C3.7 8.4 1 12 1 12s4 7 11 7a9.7 9.7 0 0 0 5.4-1.6M1 1l22 22" />
                  <path d="M9.5 9.5a3 3 0 0 0 4.24 4.24" />
                </svg>
              )}
            </button>
          </div>
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
            Forgot Password?
          </Link>
        </div>

        <button type="submit" className="tdms-submit" disabled={busy}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
          </svg>
          <span>{busy ? 'Signing In…' : 'Sign In'}</span>
        </button>
      </form>

      {canBootstrap && (
        <div className="tdms-bootstrap-wrap">
          <div className="tdms-bootstrap-divider">
            <span>System Initialization</span>
          </div>
          <p className="tdms-bootstrap-label">Don&apos;t have a system administrator yet?</p>
          <Link href="/create-super-admin" className="tdms-bootstrap-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            <span>Create Super Admin</span>
          </Link>
        </div>
      )}
    </div>
  );
}
