"use client";

import { useEffect } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { actionTone, formatActionLabel } from "./actionTone";
import { splitActorLabel } from "@/services/audit-log.service";

export type AuditLogDetails = {
  id: number;
  action: string;
  actor: string;
  target: string;
  ipAddress: string | null;
  userAgent: string | null;
  details: unknown;
  createdAt: string;
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{value ?? <span className="text-ink-muted">—</span>}</dd>
    </div>
  );
}

function PersonField({ label, value }: { label: string; value: string }) {
  const { name, email } = splitActorLabel(value);
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{name}</dd>
      {email && <dd className="text-xs text-ink-muted">{email}</dd>}
    </div>
  );
}

// Common before/after key-naming conventions used across this app's
// recordAudit() calls (e.g. old_role/new_role, old_email/new_email).
// Shown as a dedicated "Change Information" section when present;
// everything else still appears in the raw metadata viewer below.
function extractChanges(details: unknown): { field: string; from: unknown; to: unknown }[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  const record = details as Record<string, unknown>;
  const changes: { field: string; from: unknown; to: unknown }[] = [];

  for (const key of Object.keys(record)) {
    if (!key.startsWith("old_")) continue;
    const field = key.slice(4);
    const newKey = `new_${field}`;
    if (newKey in record) {
      changes.push({ field, from: record[key], to: record[newKey] });
    }
  }
  return changes;
}

function formatFieldName(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AuditLogDetailsModal({ log, onClose }: { log: AuditLogDetails; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changes = extractChanges(log.details);
  const createdAt = new Date(log.createdAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-dark/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-log-modal-title"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 id="audit-log-modal-title" className="text-base font-semibold text-ink">
            Audit Event Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-app-bg hover:text-ink"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-muted">Event Information</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Action"
                value={<StatusBadge label={formatActionLabel(log.action)} tone={actionTone(log.action)} />}
              />
              <Field
                label="Date & Time"
                value={
                  <>
                    {createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    <span className="block text-xs text-ink-muted">
                      {createdAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </>
                }
              />
              <PersonField label="Actor" value={log.actor} />
              <PersonField label="Target" value={log.target} />
            </dl>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-muted">Request Information</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="IP Address" value={log.ipAddress} />
              <Field label="User Agent" value={log.userAgent} />
            </dl>
          </section>

          {changes.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-muted">Change Information</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-app-bg">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Field</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Previous Value</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">New Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {changes.map((change) => (
                      <tr key={change.field}>
                        <td className="px-3 py-2 font-medium text-ink">{formatFieldName(change.field)}</td>
                        <td className="px-3 py-2 text-ink-soft">{String(change.from ?? "—")}</td>
                        <td className="px-3 py-2 text-ink-soft">{String(change.to ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-muted">Metadata</h3>
            {log.details ? (
              <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-app-bg p-4 text-xs text-ink-soft">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-ink-muted">No additional metadata recorded for this event.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
