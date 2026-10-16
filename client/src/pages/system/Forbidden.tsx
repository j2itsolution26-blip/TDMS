import Link from '@/lib/link';
import { BUTTON_PRIMARY } from '@/components/ui';

/**
 * Error boundary for the signed-in area.
 *
 * AuthorizationError thrown by authorizePage() lands here. Laravel showed a
 * 403 page for the same condition; the wording is deliberately vague about
 * *why*, so it cannot be used to map which resources exist.
 *
 * No "Try again": a role does not change by asking twice, so the only useful
 * way out is back to the dashboard. `onRetry` stays in the signature for the
 * callers that pass it.
 */
export default function Forbidden(_props: { onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-700" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <h1 className="mt-4 text-xl font-semibold text-ink">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-muted">
        Your account&apos;s role doesn&apos;t include it. If you need it for your work, ask a TDMS administrator.
      </p>
      <Link href="/dashboard" className={`${BUTTON_PRIMARY} mt-6`}>
        Back to dashboard
      </Link>
    </div>
  );
}
