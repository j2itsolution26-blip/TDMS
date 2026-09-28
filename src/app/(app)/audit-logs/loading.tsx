/**
 * Audit Logs skeleton, streamed while the server reads the page of events.
 *
 * Header, the four summary figures, the filter bar and a day of event rows —
 * the real page's shape, so nothing jumps when the data arrives. Announced once
 * to assistive technology; the pulse respects prefers-reduced-motion.
 */
function Block({ className }: { className: string }) {
  return <div className={`rounded-md bg-border/70 motion-safe:animate-pulse ${className}`} />;
}

export default function AuditLogsLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <p className="sr-only" role="status">Loading audit logs…</p>
      <div className="flex items-start justify-between gap-4" aria-hidden="true">
        <div className="space-y-2">
          <Block className="h-7 w-40" />
          <Block className="h-4 w-80 max-w-full" />
        </div>
        <Block className="h-9 w-24 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card px-4 py-3 shadow-card">
            <Block className="h-3 w-24" />
            <Block className="mt-2 h-6 w-14" />
            <Block className="mt-2 h-2.5 w-28" />
          </div>
        ))}
      </div>
      <div className="flex gap-2 rounded-xl border border-border bg-card p-3 shadow-card" aria-hidden="true">
        <Block className="h-9 flex-1 rounded-lg" />
        {Array.from({ length: 4 }, (_, i) => (
          <Block key={i} className="hidden h-9 w-44 rounded-lg lg:block" />
        ))}
      </div>
      <div aria-hidden="true">
        <Block className="mb-2 h-3 w-16" />
        <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-card">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-3 px-5 py-4">
              <Block className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Block className="h-3.5 w-48" />
                <Block className="h-3 w-72 max-w-full" />
                <Block className="h-2.5 w-40" />
              </div>
              <Block className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
