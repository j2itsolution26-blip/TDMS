/**
 * The audit trail could not be read.
 *
 * Its own error panel, so the sidebar and header stay usable, and so the message
 * is about the data rather than the signed-in area's generic "unauthorized" —
 * an unauthorised visitor never reaches the query. No database detail is
 * shown; the server log has it. "Try again" asks the server again.
 */
export default function AuditLogsError({ onRetry }: { onRetry: () => void }) {
  const retry = onRetry;

  return (
    <div role="alert" className="rounded-xl border border-border bg-card px-6 py-12 text-center shadow-card">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-700" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="mt-4 text-lg font-semibold text-ink">Unable to load audit logs</h1>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        We couldn&apos;t retrieve the audit activity right now. The rest of TDMS is still available from the menu.
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
