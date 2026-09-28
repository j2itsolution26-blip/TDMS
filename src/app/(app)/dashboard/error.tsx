'use client';

import { startTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The dashboard failed to load its data.
 *
 * Its own boundary rather than the signed-in area's, which says "This action
 * is unauthorized" for anything it catches. The dashboard cannot fail for
 * that reason — an anonymous visitor is redirected before any query runs —
 * so a failure here is the database or a query, and telling somebody they
 * lack permission would send them to the wrong person for help.
 *
 * The sidebar and header live in the layout above this boundary, so they stay
 * usable: one broken panel of numbers does not take the application with it.
 *
 * "Try again" refreshes the server data and then resets the boundary. Reset
 * alone would re-render the same failed result.
 */
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div role="alert" className="rounded-xl border border-border bg-card px-6 py-12 text-center shadow-card">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-700" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="mt-4 text-lg font-semibold text-ink">Unable to load dashboard data</h1>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        The figures could not be retrieved just now. The rest of TDMS is still available from the menu.
      </p>
      <button
        type="button"
        onClick={retry}
        className="mt-6 inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
      >
        Try again
      </button>
    </div>
  );
}
