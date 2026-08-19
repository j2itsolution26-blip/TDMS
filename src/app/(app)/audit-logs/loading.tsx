import { Skeleton } from "@/components/ui/Skeleton";

export default function AuditLogsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-white p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
        <div className="border-b border-slate-200 bg-app-bg px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="divide-y divide-slate-200">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-6 w-14" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
