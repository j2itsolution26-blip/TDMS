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

      <div aria-hidden="true" className="space-y-6">
        <div className="space-y-2">
          <Block className="h-3 w-56" />
          <Block className="h-7 w-72" />
          <Block className="h-3 w-80" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
              <Block className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Block className="h-3 w-20" />
                <Block className="h-6 w-14" />
                <Block className="h-2.5 w-24" />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <PanelSkeleton />
          <PanelSkeleton />
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <Block className="h-4 w-32" />
            <div className="mt-6 flex h-40 items-end gap-3">
              {[45, 70, 55, 90, 65, 80, 50].map((height, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-border/70 motion-safe:animate-pulse"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <PanelSkeleton rows={2} />
          <PanelSkeleton rows={3} />
        </div>
      </div>
    </div>
  );
}
