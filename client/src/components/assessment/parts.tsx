import { useState } from 'react';
import { api } from '@/lib/api-client';
import { useRouter } from '@/lib/navigation';
import { BATCH_STATUS_LABELS, RESULT_LABELS, RESULT_STATUS_LABELS, type BatchStatus, type BatchTotals, type ResultStatus } from '@shared/lib/assessment-center';
import type { WorkTone } from '@shared/types/dashboard';
import { useAction } from '@/components/teaching/client-kit';
import { BTN, BTN_SECONDARY, Field, Flash, INPUT, Stat, StatusPill } from '@/components/teaching/kit';

/** Pieces shared by the Assessment Center screens. */

const RESULT_TONE: Record<string, WorkTone> = { C: 'success', NYC: 'failed', PENDING: 'attention' };

/** The official result: Competent / Not Yet Competent once finalized, Pending before. */
export function ResultChip({ official }: { official: 'C' | 'NYC' | 'PENDING' | null }) {
  if (official === null) return <StatusPill label="Cancelled" tone="neutral" />;
  return <StatusPill label={official === 'PENDING' ? RESULT_LABELS.PENDING : `${RESULT_LABELS[official]} (${official})`} tone={RESULT_TONE[official] ?? 'neutral'} />;
}

const STATUS_TONE: Record<string, WorkTone> = { PENDING: 'attention', DRAFT: 'info', FINALIZED: 'success', CANCELLED: 'neutral', OPEN: 'info' };

export function ResultStatusChip({ status }: { status: string }) {
  return <StatusPill label={RESULT_STATUS_LABELS[status as ResultStatus] ?? status} tone={STATUS_TONE[status] ?? 'neutral'} />;
}

export function BatchStatusChip({ status }: { status: string }) {
  return <StatusPill label={BATCH_STATUS_LABELS[status as BatchStatus] ?? status} tone={STATUS_TONE[status] ?? 'neutral'} />;
}

export const rate = (t: BatchTotals) => (t.competentRate === null ? '—' : `${t.competentRate}%`);

/** Summary cards. Counts are finalized results only; pending is shown beside them, never in the rate. */
export function TotalsCards({ totals, batches }: { totals: BatchTotals; batches?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {batches !== undefined && <Stat label="Batches" value={batches} />}
      <Stat label="Assessed (finalized)" value={totals.assessed} />
      <Stat label="Competent" value={totals.competent} tone="success" hint={totals.assessed ? `${totals.competent} of ${totals.assessed}` : undefined} />
      <Stat label="Not Yet Competent" value={totals.notYetCompetent} tone="failed" hint={totals.assessed ? `${totals.notYetCompetent} of ${totals.assessed}` : undefined} />
      <Stat label="Pending" value={totals.pending} tone="attention" hint="Not counted until finalized" />
      <Stat label="Competency rate" value={rate(totals)} hint={totals.competentRate === null ? 'Nothing finalized yet' : 'Competent ÷ finalized'} />
    </div>
  );
}

/** A URL with the non-empty values as its query string. */
export function withQuery(path: string, values: Record<string, string | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export interface Option { id: string; name: string }
export interface Qualification { id: string; code: string; name: string; isActive: boolean }

export interface BatchFormValue {
  id?: string;
  batchNumber: string;
  programId: string;
  assessmentDate: string;
  venue: string | null;
  assessorUserId: string | null;
  assessorName: string;
  notes: string | null;
  locked?: boolean;
}

/** Create or edit a batch. The assessor is an account, or a name typed in for an external assessor. */
export function BatchForm({ value, qualifications, assessors, today, onDone }: { value: BatchFormValue | null; qualifications: Qualification[]; assessors: Option[]; today: string; onDone: () => void }) {
  const router = useRouter();
  const { busy, error, errors, run } = useAction();
  const [f, setF] = useState({
    batchNumber: value?.batchNumber ?? '',
    programId: value?.programId ?? '',
    assessmentDate: value?.assessmentDate ?? today,
    venue: value?.venue ?? '',
    assessorUserId: value?.assessorUserId ?? '',
    assessorName: value?.assessorUserId ? '' : (value?.assessorName ?? ''),
    notes: value?.notes ?? '',
  });
  const external = !f.assessorUserId;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...f, assessorUserId: f.assessorUserId || null, assessorName: external ? f.assessorName : null, venue: f.venue || null, notes: f.notes || null };
    const saved = await run(() => (value?.id ? api.put<{ id: string }>(`/api/v1/assessment/batches/${value.id}`, body) : api.post<{ id: string }>('/api/v1/assessment/batches', body)));
    if (saved) {
      onDone();
      if (!value?.id) router.push(`/assessment/batches/${saved.id}`);
    }
  }

  return (
    <form className="space-y-4" onSubmit={save} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Batch number" htmlFor="b-number" error={errors.batchNumber} hint="For example 2026-CSS-NC2-014">
          <input id="b-number" className={INPUT} value={f.batchNumber} onChange={(e) => setF({ ...f, batchNumber: e.target.value })} required maxLength={40} autoComplete="off" />
        </Field>
        <Field label="Assessment date" htmlFor="b-date" error={errors.assessmentDate}>
          <input id="b-date" type="date" className={INPUT} value={f.assessmentDate} onChange={(e) => setF({ ...f, assessmentDate: e.target.value })} required />
        </Field>
      </div>
      <Field label="Qualification" htmlFor="b-program" error={errors.programId} hint={value?.locked ? 'Fixed once candidates are enrolled.' : undefined}>
        <select id="b-program" className={INPUT} value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value })} required disabled={value?.locked}>
          <option value="">Choose a qualification…</option>
          {qualifications.filter((q) => q.isActive || q.id === f.programId).map((q) => <option key={q.id} value={q.id}>{q.code} — {q.name}</option>)}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Assessor" htmlFor="b-assessor" error={errors.assessorUserId}>
          <select id="b-assessor" className={INPUT} value={f.assessorUserId} onChange={(e) => setF({ ...f, assessorUserId: e.target.value })}>
            <option value="">External assessor (type the name)</option>
            {assessors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        {external && (
          <Field label="Assessor's name" htmlFor="b-assessor-name" error={errors.assessorName}>
            <input id="b-assessor-name" className={INPUT} value={f.assessorName} onChange={(e) => setF({ ...f, assessorName: e.target.value })} maxLength={255} />
          </Field>
        )}
      </div>
      <Field label="Venue" htmlFor="b-venue" error={errors.venue}>
        <input id="b-venue" className={INPUT} value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} maxLength={255} />
      </Field>
      <Field label="Notes" htmlFor="b-notes" error={errors.notes}>
        <textarea id="b-notes" rows={2} className={INPUT} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={2000} />
      </Field>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button>
        <button type="submit" className={BTN} disabled={busy}>{busy ? 'Saving…' : value?.id ? 'Save changes' : 'Create batch'}</button>
      </div>
    </form>
  );
}
