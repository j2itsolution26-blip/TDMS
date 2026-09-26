'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api-client';

/**
 * Consumes the verification token from the URL.
 *
 * The request is a POST, not a GET on page load, so that a mail scanner or
 * link previewer fetching the URL cannot burn a single-use token. React
 * Strict Mode also mounts effects twice in development, so the ref guard
 * keeps that from spending the token twice.
 */
export default function VerifyEmailPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    setState('working');

    api
      .post<{ email: string; next: string }>('/api/auth/verify-email', { token })
      .then((result) => {
        if (!result.ok) {
          setState('error');
          setMessage(result.message);
          return;
        }
        setState('done');
        setMessage(null);
        router.replace(result.data.next);
      });
  }, [token, router]);

  if (!token) {
    return (
      <div>
        <p className="text-sm text-slate-600">
          This link is missing its verification code. Open the link from your email exactly as it
          was sent, or ask an administrator to send a new one.
        </p>
        <div className="tdms-bootstrap-wrap">
          <Link href="/login" className="tdms-bootstrap-link"><span>Back to sign in</span></Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {state === 'working' || state === 'idle' ? (
        <p className="text-sm text-slate-600">Verifying your institutional email address…</p>
      ) : null}

      {state === 'done' && (
        <p className="text-sm text-green-700">
          Verified. Taking you to the next step…
        </p>
      )}

      {state === 'error' && (
        <>
          <p className="text-sm text-red-600">{message}</p>
          <div className="tdms-bootstrap-wrap">
            <Link href="/login" className="tdms-bootstrap-link"><span>Back to sign in</span></Link>
          </div>
        </>
      )}
    </div>
  );
}
