import { requireUser, authorizePage } from '@/server/auth/current-user';
import { systemPolicy } from '@/server/auth/policies';
import { listAuditLogs } from '@/server/services/audit-log-query';
import { parseAuditFilters } from '@shared/lib/audit-filters';
import { AUDIT_CATEGORY_LABELS, AUDIT_SEVERITIES, usedCategories } from '@shared/lib/audit-events';
import type { PageRequest } from '@/server/controllers/pages/types';

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

export async function loadAuditLogs({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(systemPolicy.viewAuditLogs(user));

  const filters = parseAuditFilters(query);
  const data = await listAuditLogs(filters);

  return {
    data,
    filters,
    categories: usedCategories().map((c) => ({ value: c, label: AUDIT_CATEGORY_LABELS[c] })),
    severities: AUDIT_SEVERITIES,
  };
}
