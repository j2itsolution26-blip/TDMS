import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { AppError, NotFoundError } from '@/server/lib/http';
import type { AuthUser } from '@shared/types/domain';
import { ACTIVITY_TYPE_LABELS, findConflicts, type ActivityType } from '@shared/lib/assessment-center';
import { institutionTimeZone } from '@shared/lib/institution-time';
import { recordAudit, actorLabel, type AuditContext } from '../audit-log';
import { notifyRoles, notifyUsers } from '../teaching/notifications';
import type { ActivityInput } from '@/server/schemas/assessment-center';

/**
 * The training and assessment calendar.
 *
 * Conflicts are a warning, not a refusal: a save that overlaps another
 * activity's venue, assessor/instructor or batch comes back as 409
 * SCHEDULE_CONFLICT listing what it clashes with, and goes through only when
 * resent with acknowledgeConflicts. Every change is audited and announced to
 * the staff who read this calendar, through the existing notifications.
 */

/** "Oct 14, 2026, 8:00 AM" in the institution's time zone. */
const when = (d: Date) => d.toLocaleString('en-PH', { timeZone: institutionTimeZone(), dateStyle: 'medium', timeStyle: 'short' });

/** Everyone told about calendar changes, besides the people assigned. */
const CALENDAR_AUDIENCE = ['assessment_center_manager', 'admin', 'director', 'coordinator', 'secretary', 'processing_officer'];

const INCLUDE = {
  program: { select: { id: true, code: true, name: true } },
  batch: { select: { id: true, batchNumber: true } },
} satisfies Prisma.TrainingActivityInclude;

function view(a: Prisma.TrainingActivityGetPayload<{ include: typeof INCLUDE }>) {
  return {
    id: a.id.toString(),
    title: a.title,
    description: a.description,
    activityType: a.activityType as ActivityType,
    program: a.program ? { id: a.program.id.toString(), code: a.program.code, name: a.program.name } : null,
    batch: a.batch ? { id: a.batch.id.toString(), batchNumber: a.batch.batchNumber } : null,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    venue: a.venue,
    assignedUserId: a.assignedUserId?.toString() ?? null,
    assignedName: a.assignedName,
    responsibleUserId: a.responsibleUserId?.toString() ?? null,
    responsibleName: a.responsibleName,
    status: a.status,
    updatedAt: a.updatedAt.toISOString(),
  };
}
export type ActivityView = ReturnType<typeof view>;

export async function listActivities(from: Date, to: Date) {
  const rows = await prisma.trainingActivity.findMany({
    where: { startsAt: { lt: to }, endsAt: { gt: from } },
    orderBy: [{ startsAt: 'asc' }, { title: 'asc' }],
    include: INCLUDE,
  });
  return rows.map(view);
}

async function personName(id: bigint | null, fallback: string | null, field: string): Promise<{ id: bigint | null; name: string | null }> {
  if (id === null) return { id: null, name: fallback };
  const u = await prisma.user.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true, name: true } });
  if (!u) throw new AppError('That person is not available.', 422, { [field]: ['That account is not available.'] });
  return { id: u.id, name: u.name };
}

/** Resolve names, check references, and refuse or warn on conflicts. */
async function prepare(input: ActivityInput, excludeId?: bigint) {
  if (input.batchId) {
    const batch = await prisma.assessmentBatch.findUnique({ where: { id: input.batchId }, select: { programId: true } });
    if (!batch) throw new AppError('That batch does not exist.', 422, { batchId: ['That batch does not exist.'] });
    if (input.programId && input.programId !== batch.programId) {
      throw new AppError('The batch belongs to another qualification.', 422, { batchId: ['That batch is for another qualification.'] });
    }
    input.programId ??= batch.programId;
  }
  if (input.programId && !(await prisma.program.findUnique({ where: { id: input.programId }, select: { id: true } }))) {
    throw new AppError('That qualification does not exist.', 422, { programId: ['That qualification does not exist.'] });
  }

  const assigned = await personName(input.assignedUserId, input.assignedName, 'assignedUserId');
  const responsible = await personName(input.responsibleUserId, input.responsibleName, 'responsibleUserId');

  const data = {
    title: input.title,
    description: input.description,
    activityType: input.activityType,
    programId: input.programId,
    batchId: input.batchId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    venue: input.venue,
    assignedUserId: assigned.id,
    assignedName: assigned.name,
    responsibleUserId: responsible.id,
    responsibleName: responsible.name,
    status: input.status,
  };

  if (!input.acknowledgeConflicts && data.status !== 'CANCELLED') {
    const overlapping = await prisma.trainingActivity.findMany({
      where: { startsAt: { lt: data.endsAt }, endsAt: { gt: data.startsAt }, status: { not: 'CANCELLED' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, title: true, startsAt: true, endsAt: true, venue: true, assignedUserId: true, assignedName: true, batchId: true, status: true },
    });
    const conflicts = findConflicts(
      { ...data, assignedUserId: data.assignedUserId?.toString() ?? null, batchId: data.batchId?.toString() ?? null },
      overlapping.map((o) => ({ ...o, id: o.id.toString(), assignedUserId: o.assignedUserId?.toString() ?? null, batchId: o.batchId?.toString() ?? null })),
    );
    if (conflicts.length > 0) {
      const what = { venue: 'same venue', assignee: 'same assessor/instructor', batch: 'same batch' } as const;
      const lines = conflicts.map((c) => {
        const o = overlapping.find((x) => x.id.toString() === c.id)!;
        return `${o.title} (${when(o.startsAt)} – ${when(o.endsAt)}): ${c.reasons.map((r) => what[r]).join(', ')}`;
      });
      throw new AppError(
        `This overlaps ${conflicts.length} other ${conflicts.length === 1 ? 'activity' : 'activities'}.`,
        409,
        { conflicts: lines },
        'SCHEDULE_CONFLICT',
      );
    }
  }
  return data;
}

async function announce(a: ActivityView, verb: 'scheduled' | 'updated' | 'removed', actor: AuthUser) {
  const n = {
    type: 'assessment.calendar',
    title: `${ACTIVITY_TYPE_LABELS[a.activityType]} ${verb}: ${a.title}`,
    body: `${when(new Date(a.startsAt))}${a.venue ? ` · ${a.venue}` : ''}`,
    href: '/assessment/calendar',
  };
  const except = BigInt(actor.id);
  await notifyRoles(prisma, CALENDAR_AUDIENCE, n, except);
  const people = [a.assignedUserId, a.responsibleUserId].filter((x): x is string => !!x).map(BigInt).filter((id) => id !== except);
  await notifyUsers(prisma, people, n);
}

export async function createActivity(input: ActivityInput, user: AuthUser, context: AuditContext) {
  const data = await prepare(input);
  const created = view(await prisma.trainingActivity.create({ data: { ...data, createdBy: BigInt(user.id), updatedBy: BigInt(user.id) }, include: INCLUDE }));
  await recordAudit({
    action: 'TRAINING_ACTIVITY_CREATED',
    actor: actorLabel(user),
    target: `Calendar: ${created.title}`,
    details: { activity_id: created.id, type: created.activityType, starts_at: created.startsAt, ends_at: created.endsAt, venue: created.venue, conflicts_acknowledged: input.acknowledgeConflicts },
    context,
  });
  await announce(created, 'scheduled', user);
  return created;
}

export async function updateActivity(id: bigint, input: ActivityInput, user: AuthUser, context: AuditContext) {
  const before = await prisma.trainingActivity.findUnique({ where: { id }, include: INCLUDE });
  if (!before) throw new NotFoundError('That activity does not exist.');
  const data = await prepare(input, id);
  const updated = view(await prisma.trainingActivity.update({ where: { id }, data: { ...data, updatedBy: BigInt(user.id) }, include: INCLUDE }));
  const old = view(before);
  await recordAudit({
    action: 'TRAINING_ACTIVITY_UPDATED',
    actor: actorLabel(user),
    target: `Calendar: ${updated.title}`,
    details: {
      activity_id: updated.id,
      before: { title: old.title, starts_at: old.startsAt, ends_at: old.endsAt, venue: old.venue, status: old.status, assigned: old.assignedName },
      after: { title: updated.title, starts_at: updated.startsAt, ends_at: updated.endsAt, venue: updated.venue, status: updated.status, assigned: updated.assignedName },
      conflicts_acknowledged: input.acknowledgeConflicts,
    },
    context,
  });
  await announce(updated, 'updated', user);
  return updated;
}

export async function deleteActivity(id: bigint, user: AuthUser, context: AuditContext) {
  const before = await prisma.trainingActivity.findUnique({ where: { id }, include: INCLUDE });
  if (!before) throw new NotFoundError('That activity does not exist.');
  await prisma.trainingActivity.delete({ where: { id } });
  const old = view(before);
  await recordAudit({
    action: 'TRAINING_ACTIVITY_DELETED',
    actor: actorLabel(user),
    target: `Calendar: ${old.title}`,
    details: { activity_id: old.id, type: old.activityType, starts_at: old.startsAt, ends_at: old.endsAt, venue: old.venue, status: old.status },
    context,
  });
  await announce(old, 'removed', user);
}
