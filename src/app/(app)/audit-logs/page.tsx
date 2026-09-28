import { requireUser, authorizePage } from '@/server/auth/current-user';
import { systemPolicy } from '@/server/auth/policies';
import { listAuditLogs } from '@/server/services/audit-log';
import { Card, PageHeader, EmptyState, Pagination, INPUT_CLASS, BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/ui';
import { diffForHumans, formatDate } from '@/lib/dates';

/**
 * Super Admin → Audit Logs. Read-only.
 *
 * Every entry records that something happened and who did it — never a
 * password, a code, a hash or a key, because nothing that writes to this table
 * records one. The filters are a plain GET form, so the page needs no
 * client-side code and every filtered view has a shareable URL.
 */
export const dynamic = 'force-dynamic';

function describe(details: Record<string, unknown> | null): string {
  if (!details) return '';
  return Object.entries(details)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; q?: string }>;
}) {
  const user = await requireUser();
  authorizePage(systemPolicy.viewAuditLogs(user));

  const { page, action, q } = await searchParams;
  const parsed = Number(page ?? 1);
  const data = await listAuditLogs({
    page: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
    action: action || null,
    q: q || null,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        subtitle="Who did what, and when, across the whole system. Newest first."
      />

      <Card>
        <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="al-action" className="block text-sm font-medium text-slate-700">Action</label>
            <select id="al-action" name="action" defaultValue={action ?? ''} className={INPUT_CLASS}>
              <option value="">All actions</option>
              {data.actions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="al-q" className="block text-sm font-medium text-slate-700">Person</label>
            <input id="al-q" name="q" defaultValue={q ?? ''} placeholder="Name or email" className={INPUT_CLASS} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className={BUTTON_PRIMARY}>Filter</button>
            <a href="/audit-logs" className={BUTTON_SECONDARY}>Clear</a>
          </div>
        </form>
      </Card>

      <Card padding="p-0">
        {data.rows.length === 0 ? (
          <EmptyState title="No entries" description="Nothing matches those filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">When</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">On</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap px-6 py-3 text-sm text-slate-500">
                        {formatDate(r.createdAt)}
                        <p className="text-xs text-slate-400">{diffForHumans(r.createdAt)}</p>
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-navy-900">{r.action}</td>
                      <td className="px-6 py-3 text-sm text-slate-600">
                        {r.actor}
                        {r.ipAddress && <p className="text-xs text-slate-400">{r.ipAddress}</p>}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600">{r.target}</td>
                      <td className="max-w-md px-6 py-3 text-xs text-slate-500">{describe(r.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              lastPage={data.lastPage}
              total={data.total}
              basePath="/audit-logs"
              query={{ action: action || undefined, q: q || undefined }}
            />
          </>
        )}
      </Card>
    </div>
  );
}
