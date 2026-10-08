import { requestMemo } from '@/server/plugins/request-context';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { AppError, NotFoundError } from '@/server/lib/http';
import { nextSchoolYearLabel } from '@shared/lib/teaching';
import type { AuthUser } from '@shared/types/domain';
import { actorLabel, recordAudit, type AuditContext } from '@/server/services/audit-log';
import { notifyRoles } from './notifications';

/**
 * The school-year lifecycle: UPCOMING → ACTIVE → ARCHIVED.
 *
 * One year is ACTIVE at a time (a partial unique index enforces it). Archiving
 * never deletes: it flips the year to ARCHIVED, which every writing service
 * checks through assertWritableYear(), so the year's classes, attendance,
 * scores and grades stay readable and can no longer be changed. Students are
 * permanent records and are never copied into the new year; what a year owns
 * is its sections, classes and the results recorded in them.
 */

export type SchoolYearRow = Prisma.SchoolYearGetPayload<object>;

export const getActiveSchoolYear = requestMemo(async () =>
  prisma.schoolYear.findFirst({ where: { status: 'ACTIVE' } }),
);

export async function listSchoolYears() {
  return prisma.schoolYear.findMany({ orderBy: { label: 'desc' } });
}

/** The year a screen shows: the one asked for, else the active one, else the latest. */
export async function resolveSchoolYear(requested?: string | null) {
  const years = await listSchoolYears();
  const chosen =
    (requested && years.find((y) => y.id.toString() === requested)) ||
    years.find((y) => y.status === 'ACTIVE') ||
    years[0] ||
    null;
  return { years, current: chosen };
}

export function assertWritableYear(year: { status: string; label: string }): void {
  if (year.status === 'ARCHIVED') {
    throw new AppError(
      `School year ${year.label} is archived. Its records are read-only.`,
      409,
      undefined,
      'SCHOOL_YEAR_ARCHIVED',
    );
  }
}

export async function createSchoolYear(
  user: AuthUser,
  input: { label: string; startsOn: Date; endsOn: Date },
  context?: AuditContext,
) {
  if (input.endsOn <= input.startsOn) {
    throw new AppError('The end date must be after the start date.', 422, { endsOn: ['The end date must be after the start date.'] });
  }
  const exists = await prisma.schoolYear.findUnique({ where: { label: input.label } });
  if (exists) throw new AppError(`School year ${input.label} already exists.`, 409, { label: ['This school year already exists.'] });

  const year = await prisma.schoolYear.create({
    data: { label: input.label, startsOn: input.startsOn, endsOn: input.endsOn, status: 'UPCOMING' },
  });
  await recordAudit({ action: 'SCHOOL_YEAR_CREATED', actor: actorLabel(user), target: `School year ${year.label}`, context });
  return year;
}

/** Make an UPCOMING year the active one. Only when no year is active. */
export async function activateSchoolYear(user: AuthUser, id: bigint, context?: AuditContext) {
  const year = await prisma.schoolYear.findUnique({ where: { id } });
  if (!year) throw new NotFoundError('School year not found.');
  if (year.status !== 'UPCOMING') throw new AppError('Only an upcoming school year can be activated.', 409);
  const active = await prisma.schoolYear.findFirst({ where: { status: 'ACTIVE' } });
  if (active) throw new AppError(`Archive ${active.label} before activating another school year.`, 409);

  const updated = await prisma.schoolYear.update({ where: { id }, data: { status: 'ACTIVE' } });
  await recordAudit({ action: 'SCHOOL_YEAR_ACTIVATED', actor: actorLabel(user), target: `School year ${year.label}`, context });
  return updated;
}

export async function setCurrentSemester(user: AuthUser, id: bigint, semester: number, context?: AuditContext) {
  const year = await prisma.schoolYear.findUnique({ where: { id } });
  if (!year) throw new NotFoundError('School year not found.');
  assertWritableYear(year);
  const updated = await prisma.schoolYear.update({ where: { id }, data: { currentSemester: semester } });
  await recordAudit({
    action: 'SCHOOL_YEAR_SEMESTER_CHANGED',
    actor: actorLabel(user),
    target: `School year ${year.label}`,
    details: { from: year.currentSemester, to: semester },
    context,
  });
  return updated;
}

// --- Archiving ---------------------------------------------------------------------

export interface ArchiveCheck {
  key: string;
  label: string;
  description: string;
  count: number;
  /** A blocking check must be cleared; the others must be acknowledged. */
  blocking: boolean;
}

/**
 * What is still outstanding in a year, per the brief's list: grades, records,
 * assessments, enrollments, student status and documents. An open attendance
 * session blocks outright — it is a meeting still in progress. The rest are
 * reported so the person archiving decides with the facts in front of them.
 */
export async function archiveChecks(id: bigint): Promise<{ year: SchoolYearRow; checks: ArchiveCheck[] }> {
  const year = await prisma.schoolYear.findUnique({ where: { id } });
  if (!year) throw new NotFoundError('School year not found.');

  const inYear = { class: { schoolYearId: id } };
  const [openSessions, unreleasedGrades, unreleasedAssessments, pendingEnrollments, pendingRequests, pendingDocuments, unassigned] =
    await Promise.all([
      prisma.attendanceSession.count({ where: { status: 'OPEN', ...inYear } }),
      prisma.classOffering.count({ where: { schoolYearId: id, gradeStatus: { not: 'RELEASED' } } }),
      prisma.assessment.count({ where: { scoreStatus: { not: 'RELEASED' }, ...inYear } }),
      prisma.enrollment.count({ where: { status: 'pending', OR: [{ schoolYearId: id }, { schoolYear: year.label }] } }),
      prisma.studentStatusRequest.count({ where: { status: 'PENDING', OR: [{ class: { schoolYearId: id } }, { classId: null }] } }),
      prisma.academicDocument.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] }, ...inYear } }),
      prisma.classOffering.count({ where: { schoolYearId: id, instructorId: null } }),
    ]);

  const checks: ArchiveCheck[] = [
    { key: 'attendance', label: 'Open attendance sessions', description: 'Meetings still taking attendance. Close them first.', count: openSessions, blocking: true },
    { key: 'grades', label: 'Outstanding grades', description: 'Classes whose grades have not been released.', count: unreleasedGrades, blocking: false },
    { key: 'assessments', label: 'Pending assessments', description: 'Quizzes, exams, activities and PT whose results are not released.', count: unreleasedAssessments, blocking: false },
    { key: 'enrollments', label: 'Pending enrollments', description: 'Enrollments in this year still awaiting a decision.', count: pendingEnrollments, blocking: false },
    { key: 'status', label: 'Pending student status requests', description: 'Instructor recommendations awaiting a decision.', count: pendingRequests, blocking: false },
    { key: 'documents', label: 'Documents awaiting review', description: 'Lesson plans, TOS and PT submitted but not yet approved or returned.', count: pendingDocuments, blocking: false },
    { key: 'records', label: 'Classes without an instructor', description: 'Incomplete class records: no Diploma Instructor assigned.', count: unassigned, blocking: false },
  ];
  return { year, checks };
}

/**
 * Archive the year and open the next one, in one transaction: there is never a
 * moment with two active years, or with none when a next year was asked for.
 */
export async function archiveSchoolYear(
  user: AuthUser,
  id: bigint,
  input: { acknowledge: boolean; next: { startsOn: Date; endsOn: Date } | null },
  context?: AuditContext,
) {
  const { year, checks } = await archiveChecks(id);
  if (year.status === 'ARCHIVED') throw new AppError(`${year.label} is already archived.`, 409);

  const blocking = checks.filter((c) => c.blocking && c.count > 0);
  if (blocking.length > 0) {
    throw new AppError(`${blocking.map((c) => c.label).join(', ')} must be cleared before archiving.`, 409, undefined, 'ARCHIVE_BLOCKED');
  }
  const outstanding = checks.filter((c) => !c.blocking && c.count > 0);
  if (outstanding.length > 0 && !input.acknowledge) {
    throw new AppError('Review and acknowledge the outstanding items before archiving.', 409, undefined, 'ARCHIVE_NEEDS_ACK');
  }

  const nextLabel = nextSchoolYearLabel(year.label);
  const result = await prisma.$transaction(async (tx) => {
    const archived = await tx.schoolYear.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date(), archivedBy: BigInt(user.id) },
    });

    let next: SchoolYearRow | null = null;
    if (input.next && nextLabel) {
      const existing = await tx.schoolYear.findUnique({ where: { label: nextLabel } });
      if (existing && existing.status === 'ARCHIVED') throw new AppError(`${nextLabel} is already archived.`, 409);
      next = existing
        ? await tx.schoolYear.update({ where: { id: existing.id }, data: { status: 'ACTIVE', currentSemester: 1 } })
        : await tx.schoolYear.create({
            data: { label: nextLabel, startsOn: input.next.startsOn, endsOn: input.next.endsOn, status: 'ACTIVE', currentSemester: 1 },
          });
    }

    await notifyRoles(tx, ['admin', 'director', 'coordinator', 'secretary', 'teacher'], {
      type: 'school-year.archived',
      title: `School year ${year.label} archived`,
      body: next
        ? `${year.label} is now read-only. ${next.label} is the active school year.`
        : `${year.label} is now read-only.`,
      href: '/calendar',
    });
    return { archived, next };
  });

  await recordAudit({
    action: 'SCHOOL_YEAR_ARCHIVED',
    actor: actorLabel(user),
    target: `School year ${year.label}`,
    details: {
      acknowledged: outstanding.map((c) => `${c.label}: ${c.count}`),
      next: result.next?.label ?? null,
    },
    context,
  });
  return result;
}
