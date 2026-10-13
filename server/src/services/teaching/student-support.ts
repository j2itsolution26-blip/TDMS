import type { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError, AuthorizationError, NotFoundError } from '@/server/lib/http';
import {
  BADGES,
  REQUESTABLE_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  SUPPORT_STATUS_LABELS,
  yearLevelLabel,
  type BadgeKey,
  type RequestableStatus,
  type SupportStatus,
} from '@shared/lib/teaching';
import { dateColumnKey, dateColumnValue } from '@shared/lib/institution-time';
import { STUDENT_STATUS_LABELS, type AuthUser, type StudentStatus } from '@shared/types/domain';
import { teachingPolicy } from '@/server/auth/policies';
import { actorLabel, recordAudit, type AuditContext } from '@/server/services/audit-log';
import type { badgeSchema, learningSupportSchema, learningSupportUpdateSchema, statusRequestSchema } from '@/server/schemas/teaching';
import { classHeading, classRoster, instructorClasses, requireInstructor, requireInstructorClass, requireRosterStudent, studentName } from './access';
import { gradebook } from './gradebook';
import { notifyRoles, notifyStudents, notifyUsers } from './notifications';

/**
 * The Instructor's student-facing duties beyond grading: status
 * recommendations, learning support and badges — plus the Students and
 * Student Progress views, which only ever list students on the Instructor's
 * own class rosters.
 */

const statusLabel = (s: string) => STUDENT_STATUS_LABELS[s as StudentStatus] ?? REQUESTABLE_STATUS_LABELS[s as RequestableStatus] ?? s;

// --- Students and progress ---------------------------------------------------------

export async function instructorStudents(user: AuthUser, schoolYearId: bigint | null) {
  const classes = await instructorClasses(user, schoolYearId);
  const rosters = await Promise.all(classes.map((c) => classRoster(c.sectionId)));
  const byStudent = new Map<string, { student: (typeof rosters)[number][number]; classes: { id: string; subject: string; detail: string }[] }>();
  classes.forEach((c, i) => {
    for (const s of rosters[i]!) {
      const entry = byStudent.get(s.id.toString()) ?? { student: s, classes: [] };
      entry.classes.push({ id: c.id.toString(), subject: c.subject.title, detail: classHeading(c).detail });
      byStudent.set(s.id.toString(), entry);
    }
  });
  return {
    classes: classes.map((c) => ({ id: c.id.toString(), label: `${c.subject.title} — ${classHeading(c).detail}` })),
    students: [...byStudent.values()]
      .map(({ student: s, classes: cs }) => ({
        id: s.id.toString(),
        studentNumber: s.studentNumber,
        name: studentName(s),
        program: s.program.code,
        programName: s.program.name,
        yearLevel: yearLevelLabel(s.yearLevel),
        section: cs[0]?.detail.split('Section ')[1] ?? '',
        status: s.status,
        statusLabel: statusLabel(s.status),
        classes: cs,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Per class, per student: running grade, attendance rate and open support — for Student Progress. */
export async function studentProgress(user: AuthUser, schoolYearId: bigint | null) {
  const classes = await instructorClasses(user, schoolYearId);
  const [books, supports] = await Promise.all([
    Promise.all(classes.map((c) => gradebook(user, c.id))),
    prisma.learningSupport.groupBy({
      by: ['classId', 'studentId'],
      where: { classId: { in: classes.map((c) => c.id) }, status: { not: 'RESOLVED' } },
      _count: { _all: true },
    }),
  ]);
  const open = new Set(supports.map((s) => `${s.classId}:${s.studentId}`));
  return books.map((b) => ({
    classId: b.cls.id,
    subject: b.cls.subject,
    detail: b.cls.detail,
    passingGrade: b.cls.passingGrade,
    gradeStatus: b.cls.gradeStatus,
    rows: b.rows.map((r) => ({
      studentId: r.studentId,
      studentNumber: r.studentNumber,
      name: r.name,
      grade: r.finalGrade,
      remark: r.remark,
      remarkLabel: r.remarkLabel,
      attendanceRate: r.attendance.rate,
      absences: r.attendance.absent,
      openSupport: open.has(`${b.cls.id}:${r.studentId}`),
    })),
  }));
}

// --- Student status recommendations ------------------------------------------------

export async function createStatusRequest(user: AuthUser, input: z.output<typeof statusRequestSchema>, context?: AuditContext) {
  const cls = await requireInstructorClass(user, input.classId, { write: true });
  const student = await requireRosterStudent(cls, input.studentId);
  if (student.status === input.requestedStatus) {
    throw new AppError(`${student.firstName} ${student.lastName} is already ${statusLabel(student.status)}.`, 422, { requestedStatus: ['That is already the student’s status.'] });
  }
  const pending = await prisma.studentStatusRequest.findFirst({ where: { studentId: student.id, status: 'PENDING' } });
  if (pending) throw new AppError('A status request for this student is already awaiting a decision.', 409, undefined, 'REQUEST_PENDING');

  const request = await prisma.$transaction(async (tx) => {
    const r = await tx.studentStatusRequest.create({
      data: {
        studentId: student.id,
        classId: cls.id,
        currentStatus: student.status,
        requestedStatus: input.requestedStatus,
        reason: input.reason,
        requestedBy: BigInt(user.id),
      },
    });
    await notifyRoles(tx, ['director', 'coordinator', 'secretary'], {
      type: 'status-request.created',
      title: `Status change requested: ${student.firstName} ${student.lastName}`,
      body: `${statusLabel(student.status)} → ${REQUESTABLE_STATUS_LABELS[input.requestedStatus]}, by ${user.name} (Diploma Instructor).`,
      href: '/status-requests',
    });
    return r;
  });

  await recordAudit({
    action: 'STUDENT_STATUS_REQUESTED',
    actor: actorLabel(user),
    target: `${student.studentNumber} — ${student.firstName} ${student.lastName}`,
    details: { from: student.status, to: input.requestedStatus, reason: input.reason },
    context,
  });
  return request;
}

export async function listStatusRequests(user: AuthUser, filter: { status?: string | null; mine?: boolean }) {
  const mine = Boolean(filter.mine);
  if (mine) requireInstructor(user);
  else if (!teachingPolicy.viewStatusRequests(user)) throw new AuthorizationError();

  const rows = await prisma.studentStatusRequest.findMany({
    where: {
      ...(mine ? { requestedBy: BigInt(user.id) } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      student: { select: { studentNumber: true, firstName: true, lastName: true, status: true, program: { select: { code: true } } } },
      class: { select: { subject: { select: { title: true } } } },
    },
  });
  const ids = [...new Set(rows.flatMap((r) => [r.requestedBy, r.decidedBy]).filter((x): x is bigint => x !== null).map(String))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids.map(BigInt) } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id.toString(), u.name]));

  return rows.map((r) => ({
    id: r.id.toString(),
    student: `${r.student.firstName} ${r.student.lastName}`,
    studentNumber: r.student.studentNumber,
    program: r.student.program.code,
    subject: r.class?.subject.title ?? null,
    currentStatus: statusLabel(r.currentStatus),
    studentStatusNow: statusLabel(r.student.status),
    requestedStatus: statusLabel(r.requestedStatus),
    reason: r.reason,
    status: r.status,
    statusLabel: REQUEST_STATUS_LABELS[r.status] ?? r.status,
    requestedBy: r.requestedBy ? names.get(r.requestedBy.toString()) ?? 'Unknown' : 'Unknown',
    decidedBy: r.decidedBy ? names.get(r.decidedBy.toString()) ?? null : null,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
  }));
}

/**
 * Approving applies the requested status to the student record; rejecting
 * leaves it as it was. Either way the Instructor is told and the decision is
 * audited. Nothing is deleted.
 */
export async function decideStatusRequest(user: AuthUser, id: bigint, decision: 'APPROVED' | 'REJECTED', note: string | null, context?: AuditContext) {
  if (!teachingPolicy.decideStatusRequests(user)) throw new AuthorizationError();
  const r = await prisma.studentStatusRequest.findUnique({ where: { id }, include: { student: { select: { id: true, studentNumber: true, firstName: true, lastName: true, status: true } } } });
  if (!r) throw new NotFoundError('Request not found.');
  if (r.status !== 'PENDING') throw new AppError('This request has already been decided.', 409);
  if (decision === 'REJECTED' && !note) throw new AppError('Give the reason for rejecting.', 422, { note: ['Give the reason for rejecting.'] });

  const name = `${r.student.firstName} ${r.student.lastName}`;
  await prisma.$transaction(async (tx) => {
    // Conditional on still PENDING, so two deciders at once cannot both apply it.
    const claimed = await tx.studentStatusRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: decision, decidedBy: BigInt(user.id), decidedAt: new Date(), decisionNote: note },
    });
    if (claimed.count === 0) throw new AppError('This request has already been decided.', 409);
    if (decision === 'APPROVED') {
      await tx.student.update({ where: { id: r.student.id }, data: { status: r.requestedStatus, updatedAt: new Date() } });
    }
    if (r.requestedBy) {
      await notifyUsers(tx, [r.requestedBy], {
        type: `status-request.${decision.toLowerCase()}`,
        title: `Status request ${decision === 'APPROVED' ? 'approved' : 'rejected'}: ${name}`,
        body: `${statusLabel(r.currentStatus)} → ${statusLabel(r.requestedStatus)}${note ? ` — ${note}` : ''}`,
        href: '/teaching/students',
      });
    }
  });

  await recordAudit({
    action: decision === 'APPROVED' ? 'STUDENT_STATUS_CHANGED' : 'STUDENT_STATUS_REQUEST_REJECTED',
    actor: actorLabel(user),
    target: `${r.student.studentNumber} — ${name}`,
    details: { from: r.student.status, to: r.requestedStatus, note },
    context,
  });
}

// --- Learning support --------------------------------------------------------------

function supportView(r: {
  id: bigint;
  classId: bigint;
  studentId: bigint;
  difficulty: string;
  evidence: string | null;
  interventions: unknown;
  support: string | null;
  followUpOn: Date | null;
  notes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  student: { studentNumber: string; firstName: string; lastName: string };
  class: { subject: { title: string } };
}, instructor?: string | null) {
  return {
    id: r.id.toString(),
    classId: r.classId.toString(),
    studentId: r.studentId.toString(),
    student: `${r.student.lastName}, ${r.student.firstName}`,
    studentNumber: r.student.studentNumber,
    subject: r.class.subject.title,
    difficulty: r.difficulty,
    evidence: r.evidence,
    interventions: Array.isArray(r.interventions) ? (r.interventions as string[]) : [],
    support: r.support,
    followUpOn: r.followUpOn ? dateColumnKey(r.followUpOn) : null,
    notes: r.notes,
    status: r.status as SupportStatus,
    statusLabel: SUPPORT_STATUS_LABELS[r.status as SupportStatus] ?? r.status,
    instructor: instructor ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const SUPPORT_INCLUDE = {
  student: { select: { studentNumber: true, firstName: true, lastName: true } },
  class: { select: { subject: { select: { title: true } }, instructor: { select: { name: true } } } },
} as const;

export async function instructorLearningSupports(user: AuthUser, schoolYearId: bigint | null) {
  requireInstructor(user);
  if (!schoolYearId) return [];
  const rows = await prisma.learningSupport.findMany({
    where: { class: { instructorId: BigInt(user.id), schoolYearId } },
    include: SUPPORT_INCLUDE,
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  });
  return rows.map((r) => supportView(r));
}

export async function monitoredLearningSupports(user: AuthUser, filter: { status?: string | null; schoolYearId: bigint | null }) {
  if (!teachingPolicy.monitorLearningSupport(user)) throw new AuthorizationError();
  const rows = await prisma.learningSupport.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.schoolYearId ? { class: { schoolYearId: filter.schoolYearId } } : {}),
    },
    include: SUPPORT_INCLUDE,
    orderBy: [{ status: 'asc' }, { followUpOn: 'asc' }],
    take: 300,
  });
  return rows.map((r) => supportView(r, r.class.instructor?.name));
}

export async function createLearningSupport(user: AuthUser, input: z.output<typeof learningSupportSchema>, context?: AuditContext) {
  const cls = await requireInstructorClass(user, input.classId, { write: true });
  const student = await requireRosterStudent(cls, input.studentId);
  const row = await prisma.learningSupport.create({
    data: {
      classId: cls.id,
      studentId: student.id,
      difficulty: input.difficulty,
      evidence: input.evidence,
      interventions: input.interventions,
      support: input.support,
      followUpOn: input.followUpOn ? dateColumnValue(input.followUpOn) : null,
      notes: input.notes,
      status: input.status,
      createdBy: BigInt(user.id),
    },
  });
  await recordAudit({
    action: 'LEARNING_SUPPORT_CREATED',
    actor: actorLabel(user),
    target: `${student.studentNumber} — ${cls.subject.title}`,
    context,
  });
  return row;
}

export async function updateLearningSupport(user: AuthUser, id: bigint, input: z.output<typeof learningSupportUpdateSchema>, context?: AuditContext) {
  requireInstructor(user);
  const existing = await prisma.learningSupport.findUnique({ where: { id }, select: { classId: true, status: true, student: { select: { studentNumber: true } } } });
  if (!existing) throw new NotFoundError('Recommendation not found.');
  const cls = await requireInstructorClass(user, existing.classId, { write: true });
  await prisma.learningSupport.update({
    where: { id },
    data: {
      difficulty: input.difficulty,
      evidence: input.evidence,
      interventions: input.interventions,
      support: input.support,
      followUpOn: input.followUpOn ? dateColumnValue(input.followUpOn) : null,
      notes: input.notes,
      status: input.status,
    },
  });
  await recordAudit({
    action: 'LEARNING_SUPPORT_UPDATED',
    actor: actorLabel(user),
    target: `${existing.student.studentNumber} — ${cls.subject.title}`,
    details: existing.status !== input.status ? { from: existing.status, to: input.status } : undefined,
    context,
  });
}

// --- Badges ------------------------------------------------------------------------

export async function awardBadge(user: AuthUser, input: z.output<typeof badgeSchema>, context?: AuditContext) {
  const cls = await requireInstructorClass(user, input.classId, { write: true });
  const student = await requireRosterStudent(cls, input.studentId);
  const badge = BADGES[input.badge as BadgeKey];

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.studentBadge.create({
      data: {
        studentId: student.id,
        classId: cls.id,
        badge: input.badge,
        reason: input.reason,
        message: input.message,
        awardedOn: dateColumnValue(input.awardedOn),
        awardedBy: BigInt(user.id),
      },
    });
    await notifyStudents(tx, [student.id], {
      type: 'badge.awarded',
      title: `${badge.emoji} You received a badge: ${badge.label}`,
      body: `${input.reason} — ${user.name}, ${cls.subject.title}${input.message ? `: “${input.message}”` : ''}`,
      href: '/my/badges',
    });
    return created;
  });

  await recordAudit({
    action: 'BADGE_AWARDED',
    actor: actorLabel(user),
    target: `${student.studentNumber} — ${student.firstName} ${student.lastName}`,
    details: { badge: badge.label, subject: cls.subject.title },
    context,
  });
  return row;
}

export async function instructorBadges(user: AuthUser, schoolYearId: bigint | null) {
  requireInstructor(user);
  if (!schoolYearId) return [];
  const rows = await prisma.studentBadge.findMany({
    where: { awardedBy: BigInt(user.id), class: { schoolYearId } },
    include: { student: { select: { studentNumber: true, firstName: true, lastName: true } }, class: { select: { subject: { select: { title: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((b) => ({
    id: b.id.toString(),
    badge: b.badge as BadgeKey,
    label: BADGES[b.badge as BadgeKey]?.label ?? b.badge,
    emoji: BADGES[b.badge as BadgeKey]?.emoji ?? '🏅',
    student: `${b.student.lastName}, ${b.student.firstName}`,
    studentNumber: b.student.studentNumber,
    subject: b.class?.subject.title ?? null,
    reason: b.reason,
    message: b.message,
    awardedOn: dateColumnKey(b.awardedOn),
  }));
}

export async function studentBadges(studentId: bigint) {
  const rows = await prisma.studentBadge.findMany({
    where: { studentId },
    include: { class: { select: { subject: { select: { title: true } }, instructor: { select: { name: true } } } } },
    orderBy: { awardedOn: 'desc' },
  });
  return rows.map((b) => ({
    id: b.id.toString(),
    label: BADGES[b.badge as BadgeKey]?.label ?? b.badge,
    emoji: BADGES[b.badge as BadgeKey]?.emoji ?? '🏅',
    subject: b.class?.subject.title ?? null,
    instructor: b.class?.instructor?.name ?? null,
    reason: b.reason,
    message: b.message,
    awardedOn: dateColumnKey(b.awardedOn),
  }));
}
