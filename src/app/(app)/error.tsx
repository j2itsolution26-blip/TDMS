'use client';

import Link from 'next/link';

/**
 * Error boundary for the signed-in area.
 *
 * AuthorizationError thrown by authorizePage() lands here. Laravel showed a
 * 403 page for the same condition; the wording is deliberately vague about
 * *why*, so it cannot be used to map which resources exist.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h1 className="text-2xl font-semibold text-navy-900">This action is unauthorized</h1>
      <p className="mt-2 text-sm text-slate-500">
        You do not have permission to view this page.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
