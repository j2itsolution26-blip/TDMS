import Link from "next/link";
import { requirePermission } from "@/server/rbac";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AuditLogFilters } from "@/components/audit-logs/AuditLogFilters";
import { AuditLogPagination } from "@/components/audit-logs/AuditLogPagination";
import { AuditLogViewButton } from "@/components/audit-logs/AuditLogViewButton";
import { actionTone, formatActionLabel } from "@/components/audit-logs/actionTone";
import {
  getAuditLogFilterOptions,
  listAuditLogs,
  parseAuditLogFilters,
  redactSensitiveDetails,
  splitActorLabel,
} from "@/services/audit-log.service";

type SearchParams = Record<string, string | undefined>;

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Unchanged from the previous implementation — same permission,
  // same redirect-on-denial behavior. Coordinators, who hold only
  // audit-logs.view.scoped, are still not admitted here; that scoping
  // decision predates this change and isn't being revisited by it.
  await requirePermission("audit-logs.view");

  const rawParams = await searchParams;
  const filters = parseAuditLogFilters(rawParams);

  const [{ logs, total }, filterOptions] = await Promise.all([
    listAuditLogs(filters),
    getAuditLogFilterOptions(),
  ]);

  const hasActiveFilters = Boolean(
    filters.search || filters.action || filters.actor || filters.target || filters.dateFrom || filters.dateTo,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Audit Logs</h1>
        <p className="text-sm text-slate-500">{total} recorded event(s).</p>
      </div>

      <AuditLogFilters actions={filterOptions.actions} actors={filterOptions.actors} targets={filterOptions.targets} />

      {logs.length === 0 ? (
        <EmptyState
          title="No audit logs found"
          description={
            hasActiveFilters
              ? "Try adjusting your filters or search criteria."
              : "Audit activity will appear here as it happens."
          }
          action={
            hasActiveFilters && (
              <Link href="/audit-logs">
                <Button type="button" variant="secondary">
                  Clear Filters
                </Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(23,53,44,0.04)]">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-app-bg">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Target</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">IP Address</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Date &amp; Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.map((log) => {
                const actorInfo = splitActorLabel(log.actor);
                const targetInfo = splitActorLabel(log.target);
                return (
                  <tr key={log.id} className="transition-colors hover:bg-app-bg">
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge label={formatActionLabel(log.action)} tone={actionTone(log.action)} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-ink">{actorInfo.name}</div>
                      {actorInfo.email && <div className="text-xs text-ink-muted">{actorInfo.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-ink">{targetInfo.name}</div>
                      {targetInfo.email && <div className="text-xs text-ink-muted">{targetInfo.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{log.ipAddress ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-ink-soft">
                      {log.createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      <div className="text-xs text-ink-muted">
                        {log.createdAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <AuditLogViewButton
                        log={{
                          id: log.id,
                          action: log.action,
                          actor: log.actor,
                          target: log.target,
                          ipAddress: log.ipAddress,
                          userAgent: log.userAgent,
                          details: redactSensitiveDetails(log.details),
                          createdAt: log.createdAt.toISOString(),
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <AuditLogPagination page={filters.page} perPage={filters.perPage} total={total} searchParams={rawParams} />
        </div>
      )}
    </div>
  );
}
