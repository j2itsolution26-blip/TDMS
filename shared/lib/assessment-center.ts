/**
 * TVET Assessment Center: the vocabulary and the arithmetic.
 *
 * Pure functions, shared so screens label things the way the server does —
 * but every official figure (batch totals, competency rates, report totals)
 * is computed on the server from the database, never accepted from a client.
 */

// --- Results -------------------------------------------------------------------------------

/** The official result values. A result is Pending until it is finalized. */
export const RESULT_VALUES = ['C', 'NYC'] as const;
export type ResultValue = (typeof RESULT_VALUES)[number];

export const RESULT_LABELS: Record<ResultValue | 'PENDING', string> = {
  C: 'Competent',
  NYC: 'Not Yet Competent',
  PENDING: 'Pending',
};

/**
 * Where a candidate's result stands.
 *
 *   PENDING    enrolled in the batch, nothing recorded yet
 *   DRAFT      a value is recorded but not finalized — still reported as Pending
 *   FINALIZED  official and locked; only a reassessment (a new attempt) follows it
 *   CANCELLED  withdrawn from the batch; counted nowhere
 */
export const RESULT_STATUSES = ['PENDING', 'DRAFT', 'FINALIZED', 'CANCELLED'] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const RESULT_STATUS_LABELS: Record<ResultStatus, string> = {
  PENDING: 'Pending',
  DRAFT: 'Draft',
  FINALIZED: 'Finalized',
  CANCELLED: 'Cancelled',
};

/** The result as reported: only a finalized result is C or NYC. */
export function officialResult(r: { status: string; result: string | null }): ResultValue | 'PENDING' | null {
  if (r.status === 'CANCELLED') return null;
  if (r.status === 'FINALIZED' && (r.result === 'C' || r.result === 'NYC')) return r.result;
  return 'PENDING';
}

// --- Batches -------------------------------------------------------------------------------

/** OPEN: results being recorded. FINALIZED: every result official, batch locked. */
export const BATCH_STATUSES = ['OPEN', 'FINALIZED', 'CANCELLED'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  OPEN: 'Open',
  FINALIZED: 'Finalized',
  CANCELLED: 'Cancelled',
};

export interface BatchTotals {
  /** Candidates with a finalized result. */
  assessed: number;
  competent: number;
  notYetCompetent: number;
  /** Not yet finalized — shown, never counted in the rate. */
  pending: number;
  /** Competent / assessed, 0–100, one decimal; null when nothing is finalized. */
  competentRate: number | null;
}

/**
 * Totals for one batch.
 *
 * One row per candidate: their LATEST attempt in this batch. A candidate
 * reassessed within the same batch is counted once, by the newer attempt;
 * the earlier finalized attempt stays on record but does not count twice.
 * Pending and draft results are excluded from assessed/C/NYC and the rate.
 */
export function batchTotals(rows: { studentId: string; attempt: number; status: string; result: string | null }[]): BatchTotals {
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (r.status === 'CANCELLED') continue;
    const seen = latest.get(r.studentId);
    if (!seen || r.attempt > seen.attempt) latest.set(r.studentId, r);
  }

  let competent = 0;
  let notYetCompetent = 0;
  let pending = 0;
  for (const r of latest.values()) {
    const official = officialResult(r);
    if (official === 'C') competent += 1;
    else if (official === 'NYC') notYetCompetent += 1;
    else if (official === 'PENDING') pending += 1;
  }
  const assessed = competent + notYetCompetent;
  return {
    assessed,
    competent,
    notYetCompetent,
    pending,
    competentRate: assessed === 0 ? null : Math.round((competent / assessed) * 1000) / 10,
  };
}

/** Sum of per-batch totals; the rate is recomputed, never averaged. */
export function combineTotals(list: BatchTotals[]): BatchTotals {
  const sum = list.reduce(
    (a, t) => ({ assessed: a.assessed + t.assessed, competent: a.competent + t.competent, notYetCompetent: a.notYetCompetent + t.notYetCompetent, pending: a.pending + t.pending }),
    { assessed: 0, competent: 0, notYetCompetent: 0, pending: 0 },
  );
  return { ...sum, competentRate: sum.assessed === 0 ? null : Math.round((sum.competent / sum.assessed) * 1000) / 10 };
}

// --- Training and assessment calendar ---------------------------------------------------

export const ACTIVITY_TYPES = ['TRAINING', 'ASSESSMENT'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = { TRAINING: 'Training', ASSESSMENT: 'Assessment' };

export const ACTIVITY_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];
export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export interface ScheduleSlot {
  id?: string;
  startsAt: Date;
  endsAt: Date;
  venue: string | null;
  assignedUserId: string | null;
  assignedName: string | null;
  batchId: string | null;
  status: string;
}

export interface ScheduleConflict {
  id: string;
  reasons: ('venue' | 'assignee' | 'batch')[];
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Activities that overlap `slot` in time AND share its venue, its assigned
 * assessor or instructor, or its batch. Touching end-to-start is not an
 * overlap. Cancelled activities never conflict.
 */
export function findConflicts(slot: ScheduleSlot, others: (ScheduleSlot & { id: string })[]): ScheduleConflict[] {
  if (slot.status === 'CANCELLED') return [];
  const out: ScheduleConflict[] = [];
  for (const o of others) {
    if (o.id === slot.id || o.status === 'CANCELLED') continue;
    if (!(slot.startsAt < o.endsAt && slot.endsAt > o.startsAt)) continue;
    const reasons: ScheduleConflict['reasons'] = [];
    if (norm(slot.venue) && norm(slot.venue) === norm(o.venue)) reasons.push('venue');
    const sameUser = slot.assignedUserId && slot.assignedUserId === o.assignedUserId;
    const sameName = !slot.assignedUserId && norm(slot.assignedName) && norm(slot.assignedName) === norm(o.assignedName);
    if (sameUser || sameName) reasons.push('assignee');
    if (slot.batchId && slot.batchId === o.batchId) reasons.push('batch');
    if (reasons.length > 0) out.push({ id: o.id, reasons });
  }
  return out;
}
