import { prisma } from '@/server/lib/prisma';
import { AppError, NotFoundError } from '@/server/lib/http';
import type { AuthUser } from '@shared/types/domain';
import { ANNOUNCEMENT_AUDIENCE_LABELS, type AnnouncementAudience } from '@shared/lib/supplies';
import { announcementPolicy, hasRole } from '@/server/auth/policies';
import { USER_MODEL_TYPE } from '@/server/auth/rbac';
import { recordAudit, actorLabel, type AuditContext } from './audit-log';
import { notifyUsers } from './teaching/notifications';
import type { AnnouncementInput } from '@/server/schemas/supplies';

/**
 * Announcements from the TVET Director: to all instructors, all students or
 * both, or narrowed to one course.
 *
 * Recipients are resolved once, when it is published, and each gets an
 * in-app notification. "Instructors of a course" are those teaching a class
 * in one of that course's sections in a school year that is not archived;
 * "students of a course" are its active students with a linked account.
 * Withdrawing hides an announcement from readers and keeps the record.
 */

const NOT_ARCHIVED = { status: { not: 'ARCHIVED' } };

async function instructorIds(programId: bigint | null): Promise<bigint[]> {
  if (programId) {
    const classes = await prisma.classOffering.findMany({
      where: { instructorId: { not: null }, section: { programId }, schoolYear: NOT_ARCHIVED },
      select: { instructorId: true },
      distinct: ['instructorId'],
    });
    return classes.map((c) => c.instructorId!);
  }
  const rows = await prisma.modelHasRole.findMany({ where: { modelType: USER_MODEL_TYPE, role: { name: 'teacher', guardName: 'web' } }, select: { modelId: true } });
  return rows.map((r) => r.modelId);
}

async function studentUserIds(programId: bigint | null): Promise<bigint[]> {
  const rows = await prisma.student.findMany({
    where: { userId: { not: null }, status: 'active', ...(programId ? { programId } : {}) },
    select: { userId: true },
  });
  return rows.map((r) => r.userId!);
}

async function recipients(audience: AnnouncementAudience, programId: bigint | null): Promise<bigint[]> {
  const ids = [
    ...(audience !== 'STUDENTS' ? await instructorIds(programId) : []),
    ...(audience !== 'INSTRUCTORS' ? await studentUserIds(programId) : []),
  ];
  const unique = [...new Set(ids.map(String))].map(BigInt);
  if (unique.length === 0) return [];
  // Live accounts only.
  const active = await prisma.user.findMany({ where: { id: { in: unique }, status: 'ACTIVE' }, select: { id: true } });
  return active.map((u) => u.id);
}

function view(a: { id: bigint; title: string; body: string; audience: string; recipientCount: number; withdrawnAt: Date | null; createdAt: Date; program: { code: string; name: string } | null }) {
  const audience = a.audience as AnnouncementAudience;
  return {
    id: a.id.toString(),
    title: a.title,
    body: a.body,
    audience,
    audienceLabel: `${ANNOUNCEMENT_AUDIENCE_LABELS[audience]}${a.program ? ` · ${a.program.code}` : ' · all courses'}`,
    program: a.program,
    recipientCount: a.recipientCount,
    withdrawn: a.withdrawnAt !== null,
    createdAt: a.createdAt.toISOString(),
  };
}
export type AnnouncementView = ReturnType<typeof view>;

const SELECT = { id: true, title: true, body: true, audience: true, recipientCount: true, withdrawnAt: true, createdAt: true, program: { select: { code: true, name: true } } } as const;

export async function publishAnnouncement(input: AnnouncementInput, user: AuthUser, context: AuditContext) {
  if (input.programId && !(await prisma.program.findUnique({ where: { id: input.programId }, select: { id: true } }))) {
    throw new AppError('That course does not exist.', 422, { programId: ['That course does not exist.'] });
  }
  const to = await recipients(input.audience, input.programId);
  if (to.length === 0) {
    throw new AppError('Nobody would receive this: there are no active accounts in that audience.', 422, { audience: ['No active accounts in this audience.'] });
  }
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: { title: input.title, body: input.body, audience: input.audience, programId: input.programId, recipientCount: to.length, createdBy: BigInt(user.id) },
      select: SELECT,
    });
    await notifyUsers(tx, to, { type: 'announcement', title: `Announcement: ${input.title}`, body: input.body.slice(0, 280), href: '/announcements' });
    return created;
  });
  await recordAudit({
    action: 'ANNOUNCEMENT_PUBLISHED',
    actor: actorLabel(user),
    target: `Announcement: ${row.title}`,
    details: { announcement_id: row.id.toString(), audience: input.audience, course: row.program?.code ?? 'all', recipients: to.length },
    context,
  });
  return view(row);
}

export async function withdrawAnnouncement(id: bigint, user: AuthUser, context: AuditContext) {
  const done = await prisma.announcement.updateMany({ where: { id, withdrawnAt: null }, data: { withdrawnAt: new Date(), withdrawnBy: BigInt(user.id) } });
  if (done.count !== 1) {
    const exists = await prisma.announcement.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundError('That announcement does not exist.');
    throw new AppError('This announcement was already withdrawn.', 409);
  }
  const row = (await prisma.announcement.findUnique({ where: { id }, select: { title: true } }))!;
  await recordAudit({ action: 'ANNOUNCEMENT_WITHDRAWN', actor: actorLabel(user), target: `Announcement: ${row.title}`, details: { announcement_id: id.toString() }, context });
}

/**
 * The announcements a user should see, newest first. A manager sees every
 * one, withdrawn included; an instructor and a student see the live ones
 * addressed to them.
 */
export async function announcementsFor(user: AuthUser, take = 50) {
  if (announcementPolicy.manage(user)) {
    const rows = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take, select: SELECT });
    return rows.map(view);
  }
  const or: object[] = [];
  if (hasRole(user, 'teacher')) {
    const taught = await prisma.classOffering.findMany({
      where: { instructorId: BigInt(user.id), schoolYear: NOT_ARCHIVED },
      select: { section: { select: { programId: true } } },
    });
    const programs = [...new Set(taught.map((c) => c.section.programId.toString()))].map(BigInt);
    or.push({ audience: { in: ['INSTRUCTORS', 'BOTH'] }, OR: [{ programId: null }, { programId: { in: programs } }] });
  }
  if (hasRole(user, 'student')) {
    const student = await prisma.student.findFirst({ where: { userId: BigInt(user.id) }, select: { programId: true } });
    if (student) or.push({ audience: { in: ['STUDENTS', 'BOTH'] }, OR: [{ programId: null }, { programId: student.programId }] });
  }
  if (or.length === 0) return [];
  const rows = await prisma.announcement.findMany({ where: { withdrawnAt: null, OR: or }, orderBy: { createdAt: 'desc' }, take, select: SELECT });
  return rows.map(view);
}
