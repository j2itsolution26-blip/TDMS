/**
 * The dashboard's skeleton, streamed while the server runs its queries.
 *
 * The same grid as the real page, so nothing jumps when the numbers arrive.
 * Announced once to assistive technology; the shapes themselves are hidden.
 * The pulse respects prefers-reduced-motion (motion-safe).
 */
function Block({ className }: { className: string }) {
  return <div className={`rounded-md bg-border/70 motion-safe:animate-pulse ${className}`} />;
}

function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <Block className="h-4 w-32" />
      <Block className="mt-2 h-3 w-48" />
      <div className="mt-5 space-y-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex-1 space-y-2">
              <Block className="h-3 w-3/5" />
              <Block className="h-2.5 w-2/5" />
            </div>
            <Block className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <p className="sr-only" role="status">Loading your dashboard…</p>

      {/* The office dashboards' shape: header, six figures, a 7/5 workspace, three status panels. */}
      <div aria-hidden="true" className="space-y-6">
        <div className="space-y-2 rounded-2xl border border-border bg-card px-5 py-6 shadow-card sm:px-7 sm:py-7">
          <Block className="h-3 w-56" />
          <Block className="h-7 w-72" />
          <Block className="h-3 w-80 max-w-full" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
              <Block className="h-9 w-9 rounded-lg" />
              <Block className="h-3 w-20" />
              <Block className="h-6 w-14" />
              <Block className="h-2.5 w-24 max-w-full" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="xl:col-span-7"><PanelSkeleton /></div>
          <div className="xl:col-span-5"><PanelSkeleton /></div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={3} />
          <div className="lg:col-span-2 xl:col-span-1"><PanelSkeleton rows={3} /></div>
        </div>
      </div>
    </div>
  );
}
