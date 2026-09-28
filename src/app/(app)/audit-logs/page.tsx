import { requireUser, authorizePage } from '@/server/auth/current-user';
import { systemPolicy } from '@/server/auth/policies';
import { listAuditLogs } from '@/server/services/audit-log-query';
import { parseAuditFilters } from '@/lib/audit-filters';
import { AUDIT_CATEGORY_LABELS, AUDIT_SEVERITIES, usedCategories } from '@/lib/audit-events';
import AuditLogsView from '@/components/audit/AuditLogsView';

/**
 * Super Admin → Audit Logs. Read-only.
 *
 * The same page, route, policy and table as before — presented as an activity
 * log instead of a raw table. The server authorises, reads one page of events
 * with every filter applied in SQL, labels and groups them, and hands the
 * result to the view in one response. loading.tsx draws the skeleton while that
 * runs; error.tsx catches a failure without taking down the application.
 *
 * Nothing secret can appear: no writer of the audit table records a password,
 * access code, hash or key, and the presentation masks any secret-shaped value
 * as a second line of defence.
 */
export const dynamic = 'force-dynamic';

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  authorizePage(systemPolicy.viewAuditLogs(user));

  const filters = parseAuditFilters(await searchParams);
  const data = await listAuditLogs(filters);

  return (
    <AuditLogsView
      data={data}
      filters={filters}
      categories={usedCategories().map((c) => ({ value: c, label: AUDIT_CATEGORY_LABELS[c] }))}
      severities={AUDIT_SEVERITIES}
    />
  );
}
