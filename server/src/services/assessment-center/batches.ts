import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { AppError, NotFoundError } from '@/server/lib/http';
import type { AuthUser } from '@shared/types/domain';
import { batchTotals, combineTotals, officialResult, type BatchTotals } from '@shared/lib/assessment-center';
import { studentName } from '@shared/lib/teaching-labels';
import { recordAudit, actorLabel, type AuditContext } from '../audit-log';
import type { ResultFilters } from '@/server/schemas/assessment-center';
import type { z } from 'zod';
import type { batchSchema } from '@/server/schemas/assessment-center';

/**
 * Assessment batches, results, reassessment and candidate history.
 *
 * Rules held here (and, for the vocabulary, by CHECK constraints in the
 * database):
 *
 *   * a FINALIZED result is never changed — it can only be followed by a
 *     reassessment, a new row with attempt + 1 that points back at it;
 *   * every state change is a conditional update (`where status = …`), so two
 *     requests racing on one result cannot both win;
 *   * totals are always computed here from the rows (shared batchTotals),
 *     counting finalized results only.
 */

type BatchInput = z.infer<typeof batchSchema>;

const actorId = (u: AuthUser) => BigInt(u.id);
const day = (key: string) => new Date(`${key}T00:00:00Z`);
const dayOut = (d: Date) => d.toISOString().slice(0, 10);

const BATCH_INCLUDE = {
  program: { select: { id: true, code: true, name: true } },
} satisfies Prisma.AssessmentBatchInclude;

function batchView(b: Prisma.AssessmentBatchGetPayload<{ include: typeof BATCH_INCLUDE }>, totals: BatchTotals) {
  return {
    id: b.id.toString(),
    batchNumber: b.batchNumber,
    program: { id: b.program.id.toString(), code: b.program.code, name: b.program.name },
    assessmentDate: dayOut(b.assessmentDate),
    venue: b.venue,
    assessorUserId: b.assessorUserId?.toString() ?? null,
    assessorName: b.assessorName,
    status: b.status,
    notes: b.notes,
    cancelReason: b.cancelReason,
    finalizedAt: b.finalizedAt?.toISOString() ?? null,
    totals,
  };
}
export type BatchView = ReturnType<typeof batchView>;

async function resolveAssessor(input: { assessorUserId: bigint | null; assessorName: string | null }) {
  if (input.assessorUserId === null) return { assessorUserId: null, assessorName: input.assessorName! };
  const user = await prisma.user.findFirst({ where: { id: input.assessorUserId, status: 'ACTIVE' }, select: { id: true, name: true } });
  if (!user) throw new AppError('That assessor account is not available.', 422, { assessorUserId: ['That assessor account is not available.'] });
  return { assessorUserId: user.id, assessorName: user.name };
}

async function activeProgram(programId: bigint) {
  const program = await prisma.program.findUnique({ where: { id: programId }, select: { id: true, isActive: true } });
  if (!program) throw new AppError('Choose a qualification.', 422, { programId: ['That qualification does not exist.'] });
  return program;
}

function uniqueBatchNumber(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new AppError('That batch number is already used.', 422, { batchNumber: ['That batch number is already used.'] });
  }
  throw error;
}

async function loadBatch(id: bigint) {
  const batch = await prisma.assessmentBatch.findUnique({ where: { id }, include: BATCH_INCLUDE });
  if (!batch) throw new NotFoundError('That assessment batch does not exist.');
  return batch;
}

function requireOpen(batch: { status: string; batchNumber: string }) {
  if (batch.status !== 'OPEN') {
    throw new AppError(`Batch ${batch.batchNumber} is ${batch.status.toLowerCase()} and can no longer be changed.`, 409);
  }
}

// --- Batches ---------------------------------------------------------------------------

export async function createBatch(input: BatchInput, user: AuthUser, context: AuditContext) {
  const program = await activeProgram(input.programId);
  if (!program.isActive) throw new AppError('That qualification is inactive.', 422, { programId: ['That qualification is inactive.'] });
  const assessor = await resolveAssessor(input);

  const batch = await prisma.assessmentBatch
    .create({
      data: {
        batchNumber: input.batchNumber,
        programId: input.programId,
        assessmentDate: day(input.assessmentDate),
        venue: input.venue,
        notes: input.notes,
        ...assessor,
        createdBy: actorId(user),
      },
      include: BATCH_INCLUDE,
    })
    .catch(uniqueBatchNumber);

  await recordAudit({
    action: 'ASSESSMENT_BATCH_CREATED',
    actor: actorLabel(user),
    target: `Assessment batch ${batch.batchNumber}`,
    details: { batch_id: batch.id.toString(), program: batch.program.code, assessment_date: input.assessmentDate, assessor: batch.assessorName },
    context,
  });
  return batchView(batch, batchTotals([]));
}

export async function updateBatch(id: bigint, input: BatchInput, user: AuthUser, context: AuditContext) {
  const batch = await loadBatch(id);
  requireOpen(batch);
  if (input.programId !== batch.programId) {
    const enrolled = await prisma.assessmentResult.count({ where: { batchId: id, status: { not: 'CANCELLED' } } });
    if (enrolled > 0) {
      throw new AppError('The qualification cannot change once candidates are enrolled.', 422, { programId: ['The qualification cannot change once candidates are enrolled.'] });
    }
    await activeProgram(input.programId);
  }
  const assessor = await resolveAssessor(input);

  const updated = await prisma.assessmentBatch
    .update({
      where: { id },
      data: { batchNumber: input.batchNumber, programId: input.programId, assessmentDate: day(input.assessmentDate), venue: input.venue, notes: input.notes, ...assessor },
      include: BATCH_INCLUDE,
    })
    .catch(uniqueBatchNumber);

  await recordAudit({
    action: 'ASSESSMENT_BATCH_UPDATED',
    actor: actorLabel(user),
    target: `Assessment batch ${updated.batchNumber}`,
    details: {
      batch_id: id.toString(),
      before: { batch_number: batch.batchNumber, assessment_date: dayOut(batch.assessmentDate), assessor: batch.assessorName, venue: batch.venue },
      after: { batch_number: updated.batchNumber, assessment_date: input.assessmentDate, assessor: updated.assessorName, venue: updated.venue },
    },
    context,
  });
  return batchView(updated, await totalsFor(id));
}

/** A batch with no finalized result may be called off; its open results are cancelled with it. */
export async function cancelBatch(id: bigint, reason: string, user: AuthUser, context: AuditContext) {
  const batch = await loadBatch(id);
  requireOpen(batch);
  const finalized = await prisma.assessmentResult.count({ where: { batchId: id, status: 'FINALIZED' } });
  if (finalized > 0) throw new AppError('This batch has finalized results and cannot be cancelled.', 409);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const done = await tx.assessmentBatch.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason } });
    if (done.count !== 1) throw new AppError('This batch was changed by someone else. Reload and try again.', 409);
    await tx.assessmentResult.updateMany({
      where: { batchId: id, status: { in: ['PENDING', 'DRAFT'] } },
      data: { status: 'CANCELLED', cancelledAt: now, cancelReason: `Batch cancelled: ${reason}` },
    });
  });

  await recordAudit({
    action: 'ASSESSMENT_BATCH_CANCELLED',
    actor: actorLabel(user),
    target: `Assessment batch ${batch.batchNumber}`,
    details: { batch_id: id.toString(), reason },
    context,
  });
}

/**
 * Make every result official and lock the batch. Refused while any candidate
 * still has no recorded result — finalizing would otherwise report someone
 * who was never assessed.
 */
export async function finalizeBatch(id: bigint, user: AuthUser, context: AuditContext) {
  const batch = await loadBatch(id);
  requireOpen(batch);
  const now = new Date();

  await prisma.$transaction(
    async (tx) => {
      const live = await tx.assessmentResult.findMany({ where: { batchId: id, status: { not: 'CANCELLED' } }, select: { status: true } });
      if (live.length === 0) throw new AppError('Enrol candidates and record their results before finalizing.', 422);
      const pending = live.filter((r) => r.status === 'PENDING').length;
      if (pending > 0) {
        throw new AppError(`${pending} candidate${pending === 1 ? ' has' : 's have'} no recorded result yet. Record or cancel ${pending === 1 ? 'it' : 'them'} first.`, 422);
      }
      await tx.assessmentResult.updateMany({ where: { batchId: id, status: 'DRAFT' }, data: { status: 'FINALIZED', finalizedAt: now, finalizedBy: actorId(user) } });
      const done = await tx.assessmentBatch.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'FINALIZED', finalizedAt: now, finalizedBy: actorId(user) } });
      if (done.count !== 1) throw new AppError('This batch was changed by someone else. Reload and try again.', 409);
    },
    { isolationLevel: 'Serializable' },
  ).catch(raceToConflict);

  const totals = await totalsFor(id);
  await recordAudit({
    action: 'ASSESSMENT_BATCH_FINALIZED',
    actor: actorLabel(user),
    target: `Assessment batch ${batch.batchNumber}`,
    details: { batch_id: id.toString(), ...totals },
    context,
  });
  return totals;
}

function raceToConflict(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002')) {
    throw new AppError('Someone else changed these results at the same time. Reload and try again.', 409);
  }
  throw error;
}

async function totalsFor(batchId: bigint): Promise<BatchTotals> {
  const rows = await prisma.assessmentResult.findMany({ where: { batchId }, select: { studentId: true, attempt: true, status: true, result: true } });
  return batchTotals(rows.map((r) => ({ ...r, studentId: r.studentId.toString() })));
}

/** Totals for many batches in two queries. */
async function totalsForMany(batchIds: bigint[]): Promise<Map<string, BatchTotals>> {
  if (batchIds.length === 0) return new Map();
  const rows = await prisma.assessmentResult.findMany({
    where: { batchId: { in: batchIds } },
    select: { batchId: true, studentId: true, attempt: true, status: true, result: true },
  });
  const grouped = new Map<string, { studentId: string; attempt: number; status: string; result: string | null }[]>();
  for (const r of rows) {
    const key = r.batchId.toString();
    grouped.set(key, [...(grouped.get(key) ?? []), { studentId: r.studentId.toString(), attempt: r.attempt, status: r.status, result: r.result }]);
  }
  return new Map(batchIds.map((id) => [id.toString(), batchTotals(grouped.get(id.toString()) ?? [])]));
}

// --- One batch -------------------------------------------------------------------------

export async function getBatch(id: bigint) {
  const batch = await loadBatch(id);
  const results = await prisma.assessmentResult.findMany({
    where: { batchId: id },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }, { attempt: 'asc' }],
    include: {
      student: { select: { id: true, studentNumber: true, firstName: true, middleName: true, lastName: true } },
      previous: { select: { id: true, result: true, attempt: true, batch: { select: { id: true, batchNumber: true } } } },
      reassessment: { select: { id: true, status: true, batch: { select: { id: true, batchNumber: true } } } },
    },
  });
  const totals = batchTotals(results.map((r) => ({ studentId: r.studentId.toString(), attempt: r.attempt, status: r.status, result: r.result })));

  return {
    batch: batchView(batch, totals),
    results: results.map((r) => ({
      id: r.id.toString(),
      studentId: r.student.id.toString(),
      candidateId: r.student.studentNumber,
      name: studentName(r.student),
      attempt: r.attempt,
      recorded: r.result,
      official: officialResult(r),
      status: r.status,
      remarks: r.remarks,
      cancelReason: r.cancelReason,
      previous: r.previous ? { id: r.previous.id.toString(), result: r.previous.result, attempt: r.previous.attempt, batchId: r.previous.batch.id.toString(), batchNumber: r.previous.batch.batchNumber } : null,
      reassessment: r.reassessment ? { id: r.reassessment.id.toString(), status: r.reassessment.status, batchId: r.reassessment.batch.id.toString(), batchNumber: r.reassessment.batch.batchNumber } : null,
    })),
  };
}

// --- Enrolment -------------------------------------------------------------------------

/**
 * Add candidates to an open batch. Each must study the batch's qualification
 * and have no result in progress for it elsewhere. A candidate already
 * Competent is refused; one Not Yet Competent is pointed at Reassess, which
 * links the new attempt to the old result instead of starting afresh.
 */
export async function enrolCandidates(batchId: bigint, studentIds: bigint[], user: AuthUser, context: AuditContext) {
  const batch = await loadBatch(batchId);
  requireOpen(batch);
  const unique = [...new Set(studentIds.map(String))].map(BigInt);

  const students = await prisma.student.findMany({
    where: { id: { in: unique } },
    select: { id: true, studentNumber: true, firstName: true, middleName: true, lastName: true, programId: true },
  });
  const prior = await prisma.assessmentResult.findMany({
    where: { studentId: { in: unique }, status: { not: 'CANCELLED' }, batch: { programId: batch.programId } },
    select: { studentId: true, status: true, result: true, attempt: true, batch: { select: { id: true, batchNumber: true } } },
    orderBy: { attempt: 'desc' },
  });

  const added: string[] = [];
  const refused: { candidateId: string; name: string; reason: string }[] = [];

  for (const id of unique) {
    const s = students.find((x) => x.id === id);
    if (!s) { refused.push({ candidateId: id.toString(), name: '—', reason: 'No such student.' }); continue; }
    const label = { candidateId: s.studentNumber, name: studentName(s) };
    if (s.programId !== batch.programId) { refused.push({ ...label, reason: `Not enrolled in ${batch.program.code}.` }); continue; }

    const mine = prior.filter((p) => p.studentId === id);
    const inProgress = mine.find((p) => p.status === 'PENDING' || p.status === 'DRAFT');
    if (inProgress) { refused.push({ ...label, reason: inProgress.batch.id === batchId ? 'Already in this batch.' : `Already in batch ${inProgress.batch.batchNumber}.` }); continue; }
    const latest = mine.find((p) => p.status === 'FINALIZED');
    if (latest?.result === 'C') { refused.push({ ...label, reason: `Already Competent (batch ${latest.batch.batchNumber}).` }); continue; }
    if (latest?.result === 'NYC') { refused.push({ ...label, reason: `Not Yet Competent in batch ${latest.batch.batchNumber} — use Reassess so the attempts stay linked.` }); continue; }

    // First attempt, unless an earlier one here was cancelled (its row is kept).
    const taken = await prisma.assessmentResult.findMany({ where: { batchId, studentId: id }, select: { attempt: true } });
    const attempt = taken.length === 0 ? 1 : Math.max(...taken.map((t) => t.attempt)) + 1;
    try {
      await prisma.assessmentResult.create({ data: { batchId, studentId: id, attempt, status: 'PENDING' } });
      added.push(s.studentNumber);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { refused.push({ ...label, reason: 'Already in this batch.' }); continue; }
      throw error;
    }
  }

  if (added.length > 0) {
    await recordAudit({
      action: 'ASSESSMENT_CANDIDATES_ENROLLED',
      actor: actorLabel(user),
      target: `Assessment batch ${batch.batchNumber}`,
      details: { batch_id: batchId.toString(), candidates: added },
      context,
    });
  }
  return { added: added.length, refused };
}

// --- Results ---------------------------------------------------------------------------

async function loadResult(id: bigint) {
  const r = await prisma.assessmentResult.findUnique({
    where: { id },
    include: { batch: { select: { id: true, batchNumber: true, status: true, programId: true } }, student: { select: { studentNumber: true, firstName: true, middleName: true, lastName: true } } },
  });
  if (!r) throw new NotFoundError('That result does not exist.');
  return r;
}

const resultTarget = (r: Awaited<ReturnType<typeof loadResult>>) =>
  `Result: ${r.student.studentNumber} (${studentName(r.student)}), batch ${r.batch.batchNumber}, attempt ${r.attempt}`;

/** Record or correct a value while the result is not yet finalized. */
export async function recordResult(id: bigint, value: 'C' | 'NYC', remarks: string | null, user: AuthUser, context: AuditContext) {
  const r = await loadResult(id);
  requireOpen(r.batch);
  if (r.status === 'FINALIZED') throw new AppError('This result is finalized. Use Reassess to record a new attempt.', 409);
  if (r.status === 'CANCELLED') throw new AppError('This result was cancelled.', 409);

  const done = await prisma.assessmentResult.updateMany({
    where: { id, status: { in: ['PENDING', 'DRAFT'] } },
    data: { result: value, remarks, status: 'DRAFT', recordedBy: actorId(user), recordedAt: new Date() },
  });
  if (done.count !== 1) throw new AppError('This result was changed by someone else. Reload and try again.', 409);

  await recordAudit({
    action: 'ASSESSMENT_RESULT_RECORDED',
    actor: actorLabel(user),
    target: resultTarget(r),
    details: { result_id: id.toString(), before: r.result, after: value, status: 'DRAFT' },
    context,
  });
}

export async function finalizeResult(id: bigint, user: AuthUser, context: AuditContext) {
  const r = await loadResult(id);
  requireOpen(r.batch);
  if (r.status !== 'DRAFT') {
    throw new AppError(r.status === 'PENDING' ? 'Record a result before finalizing it.' : `This result is already ${r.status.toLowerCase()}.`, 409);
  }
  const done = await prisma.assessmentResult.updateMany({
    where: { id, status: 'DRAFT', result: { not: null } },
    data: { status: 'FINALIZED', finalizedAt: new Date(), finalizedBy: actorId(user) },
  });
  if (done.count !== 1) throw new AppError('This result was changed by someone else. Reload and try again.', 409);

  await recordAudit({ action: 'ASSESSMENT_RESULT_FINALIZED', actor: actorLabel(user), target: resultTarget(r), details: { result_id: id.toString(), result: r.result }, context });
}

export async function cancelResult(id: bigint, reason: string, user: AuthUser, context: AuditContext) {
  const r = await loadResult(id);
  requireOpen(r.batch);
  if (r.status === 'FINALIZED') throw new AppError('A finalized result cannot be cancelled; it stays on record.', 409);
  if (r.status === 'CANCELLED') throw new AppError('This result is already cancelled.', 409);

  const done = await prisma.assessmentResult.updateMany({
    where: { id, status: { in: ['PENDING', 'DRAFT'] } },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
  });
  if (done.count !== 1) throw new AppError('This result was changed by someone else. Reload and try again.', 409);

  await recordAudit({ action: 'ASSESSMENT_RESULT_CANCELLED', actor: actorLabel(user), target: resultTarget(r), details: { result_id: id.toString(), reason, recorded: r.result }, context });
}

/**
 * Reassess a Not Yet Competent candidate: a new attempt in an open batch of
 * the same qualification, linked to the finalized result it follows. That
 * result is not touched. One reassessment per result (enforced by a unique
 * index), so attempts form a single chain.
 */
export async function reassess(id: bigint, targetBatchId: bigint, user: AuthUser, context: AuditContext) {
  const source = await loadResult(id);
  if (source.status !== 'FINALIZED') throw new AppError('Only a finalized result can be reassessed.', 409);
  if (source.result !== 'NYC') throw new AppError('Only a Not Yet Competent result is reassessed.', 409);

  const target = await prisma.assessmentBatch.findUnique({ where: { id: targetBatchId }, select: { id: true, batchNumber: true, status: true, programId: true } });
  if (!target) throw new AppError('Choose the batch for the reassessment.', 422, { targetBatchId: ['That batch does not exist.'] });
  if (target.status !== 'OPEN') throw new AppError(`Batch ${target.batchNumber} is not open.`, 422, { targetBatchId: [`Batch ${target.batchNumber} is not open.`] });
  if (target.programId !== source.batch.programId) {
    throw new AppError('The reassessment must be for the same qualification.', 422, { targetBatchId: ['That batch is for another qualification.'] });
  }

  const created = await prisma
    .$transaction(async (tx) => {
      const existing = await tx.assessmentResult.findFirst({ where: { previousResultId: id }, select: { id: true } });
      if (existing) throw new AppError('This result already has a reassessment.', 409);
      const inProgress = await tx.assessmentResult.findFirst({
        where: { studentId: source.studentId, status: { in: ['PENDING', 'DRAFT'] }, batch: { programId: source.batch.programId } },
        select: { batch: { select: { batchNumber: true } } },
      });
      if (inProgress) throw new AppError(`The candidate is already being assessed in batch ${inProgress.batch.batchNumber}.`, 409);

      const taken = await tx.assessmentResult.findMany({ where: { batchId: targetBatchId, studentId: source.studentId }, select: { attempt: true } });
      const attempt = Math.max(source.attempt + 1, ...taken.map((t) => t.attempt + 1));
      return tx.assessmentResult.create({
        data: { batchId: targetBatchId, studentId: source.studentId, attempt, status: 'PENDING', previousResultId: id },
        select: { id: true, attempt: true },
      });
    })
    .catch(raceToConflict);

  await recordAudit({
    action: 'ASSESSMENT_REASSESSMENT_CREATED',
    actor: actorLabel(user),
    target: resultTarget(source),
    details: { previous_result_id: id.toString(), new_result_id: created.id.toString(), attempt: created.attempt, target_batch: target.batchNumber },
    context,
  });
  return { id: created.id.toString(), batchId: targetBatchId.toString() };
}

// --- Monitoring ------------------------------------------------------------------------

const PAGE = 25;

function batchWhere(f: Pick<ResultFilters, 'batchId' | 'programId' | 'date' | 'from' | 'to' | 'assessor'>): Prisma.AssessmentBatchWhereInput {
  const where: Prisma.AssessmentBatchWhereInput = {};
  if (f.batchId) where.id = f.batchId;
  if (f.programId) where.programId = f.programId;
  if (f.assessor) where.assessorName = { contains: f.assessor, mode: 'insensitive' };
  if (f.date) where.assessmentDate = day(f.date);
  else if (f.from || f.to) where.assessmentDate = { ...(f.from ? { gte: day(f.from) } : {}), ...(f.to ? { lte: day(f.to) } : {}) };
  return where;
}

/**
 * The monitoring view: result rows matching every filter, and a summary for
 * each batch in scope. Batch summaries use the batch filters only (a
 * candidate search does not change a batch's totals).
 */
export async function listResults(f: ResultFilters) {
  const bWhere = batchWhere(f);
  const where: Prisma.AssessmentResultWhereInput = { status: { not: 'CANCELLED' }, batch: bWhere };
  if (f.candidate) {
    const words = f.candidate.split(/\s+/).filter(Boolean);
    where.AND = words.map((w) => ({
      student: { OR: [{ studentNumber: { contains: w, mode: 'insensitive' } }, { firstName: { contains: w, mode: 'insensitive' } }, { lastName: { contains: w, mode: 'insensitive' } }] },
    }));
  }
  if (f.result === 'PENDING') where.status = { in: ['PENDING', 'DRAFT'] };
  else if (f.result) { where.status = 'FINALIZED'; where.result = f.result; }

  const [total, rows, batches] = await Promise.all([
    prisma.assessmentResult.count({ where }),
    prisma.assessmentResult.findMany({
      where,
      orderBy: [{ batch: { assessmentDate: 'desc' } }, { batch: { batchNumber: 'asc' } }, { student: { lastName: 'asc' } }, { attempt: 'asc' }],
      skip: (f.page - 1) * PAGE,
      take: PAGE,
      include: {
        student: { select: { id: true, studentNumber: true, firstName: true, middleName: true, lastName: true } },
        batch: { select: { id: true, batchNumber: true, assessmentDate: true, assessorName: true, program: { select: { code: true, name: true } } } },
      },
    }),
    prisma.assessmentBatch.findMany({ where: { ...bWhere, status: { not: 'CANCELLED' } }, include: BATCH_INCLUDE, orderBy: [{ assessmentDate: 'desc' }, { batchNumber: 'asc' }], take: 100 }),
  ]);

  const totals = await totalsForMany(batches.map((b) => b.id));
  const summaries = batches.map((b) => batchView(b, totals.get(b.id.toString())!));

  return {
    rows: rows.map((r) => ({
      id: r.id.toString(),
      studentId: r.student.id.toString(),
      candidateId: r.student.studentNumber,
      name: studentName(r.student),
      batchId: r.batch.id.toString(),
      batchNumber: r.batch.batchNumber,
      qualification: `${r.batch.program.code} — ${r.batch.program.name}`,
      assessorName: r.batch.assessorName,
      assessmentDate: dayOut(r.batch.assessmentDate),
      attempt: r.attempt,
      official: officialResult(r),
      status: r.status,
    })),
    page: f.page,
    lastPage: Math.max(1, Math.ceil(total / PAGE)),
    total,
    summaries,
    overall: combineTotals(summaries.map((s) => s.totals)),
  };
}

/** Every attempt a candidate has had, across batches, oldest first. */
export async function candidateHistory(studentId: bigint) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, studentNumber: true, firstName: true, middleName: true, lastName: true, status: true, program: { select: { code: true, name: true } } },
  });
  if (!student) throw new NotFoundError('That candidate does not exist.');
  const results = await prisma.assessmentResult.findMany({
    where: { studentId },
    orderBy: [{ batch: { assessmentDate: 'asc' } }, { attempt: 'asc' }],
    include: { batch: { select: { id: true, batchNumber: true, assessmentDate: true, assessorName: true, status: true, program: { select: { code: true, name: true } } } } },
  });
  return {
    candidate: {
      id: student.id.toString(),
      candidateId: student.studentNumber,
      name: studentName(student),
      status: student.status,
      program: `${student.program.code} — ${student.program.name}`,
    },
    history: results.map((r) => ({
      id: r.id.toString(),
      batchId: r.batch.id.toString(),
      batchNumber: r.batch.batchNumber,
      batchStatus: r.batch.status,
      qualification: `${r.batch.program.code} — ${r.batch.program.name}`,
      assessmentDate: dayOut(r.batch.assessmentDate),
      assessorName: r.batch.assessorName,
      attempt: r.attempt,
      recorded: r.result,
      official: officialResult(r),
      status: r.status,
      remarks: r.remarks,
      cancelReason: r.cancelReason,
      previousResultId: r.previousResultId?.toString() ?? null,
      finalizedAt: r.finalizedAt?.toISOString() ?? null,
    })),
  };
}

export async function openBatches(programId?: bigint) {
  const rows = await prisma.assessmentBatch.findMany({
    where: { status: 'OPEN', ...(programId ? { programId } : {}) },
    orderBy: [{ assessmentDate: 'asc' }, { batchNumber: 'asc' }],
    select: { id: true, batchNumber: true, assessmentDate: true, programId: true },
  });
  return rows.map((b) => ({ id: b.id.toString(), batchNumber: b.batchNumber, assessmentDate: dayOut(b.assessmentDate), programId: b.programId.toString() }));
}

export async function batchOptions() {
  const rows = await prisma.assessmentBatch.findMany({
    where: { status: { not: 'CANCELLED' } },
    orderBy: [{ assessmentDate: 'desc' }, { batchNumber: 'asc' }],
    select: { id: true, batchNumber: true, assessmentDate: true, programId: true, status: true },
    take: 500,
  });
  return rows.map((b) => ({ id: b.id.toString(), batchNumber: b.batchNumber, assessmentDate: dayOut(b.assessmentDate), programId: b.programId.toString(), status: b.status }));
}
