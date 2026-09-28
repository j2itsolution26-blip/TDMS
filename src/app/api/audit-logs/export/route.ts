import type { NextRequest } from 'next/server';
import { withErrorHandling, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { systemPolicy } from '@/server/auth/policies';
import { recordAudit, actorLabel } from '@/server/services/audit-log';
import { exportAuditLogs, EXPORT_LIMIT } from '@/server/services/audit-log-query';
import { parseAuditFilters } from '@/lib/audit-filters';

/**
 * GET /api/audit-logs/export — the Audit Logs page, as CSV, for its current
 * filters.
 *
 * Super Admin only, the same policy as the page. The file carries exactly what
 * the page shows — readable event, original code, people, time, IP and the
 * structured details — and so contains no password, code or key: none is ever
 * recorded. Capped at EXPORT_LIMIT rows; a truncated file says so in its last
 * line.
 *
 * Exporting the security log is itself a security-relevant act, so it is
 * recorded (AUDIT_LOG_EXPORTED) with the row count and filters used.
 */

/** Neutralise spreadsheet formula injection: a cell must not start a formula. */
function cell(value: string | null | undefined): string {
  let s = value ?? '';
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(systemPolicy.viewAuditLogs(user));

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = parseAuditFilters(params);
  const { events, total, truncated } = await exportAuditLogs(filters);

  const header = [
    'Event ID', 'Date and time', 'Event', 'Event code', 'Category', 'Severity',
    'Performed by', 'Performed by email', 'Performed by role',
    'Target', 'Target email', 'Target role', 'IP address', 'Details',
  ];
  const lines = [header.map(cell).join(',')];
  for (const e of events) {
    lines.push(
      [
        e.id, `${e.dateTimeLabel} (${e.createdAt})`, e.label, e.code, e.categoryLabel, e.severity,
        e.actor.name, e.actor.email, e.actor.role,
        e.target.name, e.target.email, e.target.role, e.ipAddress,
        e.fields.map((f) => `${f.label}: ${f.value}`).join('; '),
      ].map((v) => cell(v)).join(','),
    );
  }
  if (truncated) lines.push(cell(`Truncated: first ${EXPORT_LIMIT} of ${total} matching events.`));

  const applied = Object.fromEntries(
    Object.entries(params).filter(([k, v]) => v && k !== 'page'),
  );
  await recordAudit({
    action: 'AUDIT_LOG_EXPORTED',
    actor: actorLabel(user),
    target: 'Audit log',
    details: { rows: events.length, truncated, filters: Object.keys(applied).length ? applied : 'none' },
    context: requestContext(request),
  });

  const stamp = new Date().toISOString().slice(0, 10);
  // A byte-order mark so Excel opens the UTF-8 file with names intact.
  return new Response(`﻿${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tdms-audit-log-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
