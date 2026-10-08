/**
 * A page's data could not be loaded — the database or the network, not
 * permissions (those get Forbidden). The message is the server's own
 * user-facing sentence; database detail stays in the server log.
 */
export default function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-border bg-card px-6 py-12 text-center shadow-card">
      <h1 className="text-lg font-semibold text-ink">Unable to load this page</h1>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
      >
        Try again
      </button>
    </div>
  );
}
