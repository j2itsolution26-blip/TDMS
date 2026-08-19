import { requirePermission } from "@/server/rbac";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui/EmptyState";

const PAGE_SIZE = 25;

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission("audit-logs.view");
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Audit Logs</h1>
        <p className="text-sm text-slate-500">{total} recorded event(s).</p>
      </div>

      {logs.length === 0 ? (
        <EmptyState title="No audit activity yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Target</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{log.action}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.actor}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{log.target}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{log.createdAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-3">
                {page > 1 && (
                  <a href={`/audit-logs?page=${page - 1}`} className="font-medium text-emerald-700 hover:text-emerald-900">
                    Previous
                  </a>
                )}
                {page < totalPages && (
                  <a href={`/audit-logs?page=${page + 1}`} className="font-medium text-emerald-700 hover:text-emerald-900">
                    Next
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
