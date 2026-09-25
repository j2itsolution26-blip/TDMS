'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Root error boundary (Phase 13).
 *
 * Next passes a redacted Error in production — the real message and stack
 * stay on the server. Nothing from `error` is rendered here beyond the
 * digest, which is just a correlation id for the server log.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[TDMS] Render error:', error.digest ?? error.name);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold text-navy-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-500">
        The page could not be displayed. Please try again, or contact an administrator if it keeps
        happening.
      </p>
      {error.digest && <p className="mt-2 text-xs text-slate-400">Reference: {error.digest}</p>}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
