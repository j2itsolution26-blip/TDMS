import 'server-only';
import type { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { AuthorizationError, NotFoundError } from '@/lib/http';
import { pdsCompletion, readPds } from '@/lib/pds';
import type { AuthUser } from '@/types/domain';
import { USER_MODEL_TYPE } from '@/server/auth/rbac';
import { teachingPolicy } from '@/server/auth/policies';
import { actorLabel, recordAudit, type AuditContext } from '@/server/services/audit-log';
import type { pdsSchema } from '@/server/validation/teaching';
import { requireInstructor } from './access';

/**
 * The Instructor Personal Data Sheet.
 *
 * The Instructor edits their own; the Director may read any Instructor's, and
 * every such read is written to the audit trail — it is personal data (birth
 * date, address, family), so who looked at it, and when, is on record. The
 * audit entries name the sheet, never its contents. Nobody else can read it.
 */

export async function ownPds(user: AuthUser) {
  requireInstructor(user);
  const row = await prisma.instructorProfile.findUnique({ where: { userId: BigInt(user.id) } });
  const data = readPds(row);
  return { data, completion: pdsCompletion(data), updatedAt: row?.updatedAt.toISOString() ?? null };
}

export async function saveOwnPds(user: AuthUser, input: z.output<typeof pdsSchema>, context?: AuditContext) {
  requireInstructor(user);
  const data = {
    employeeId: input.employeeId || null,
    personal: input.personal,
    family: input.family,
    education: input.education,
    eligibility: input.eligibility,
    work: input.work,
    training: input.training,
  };
  await prisma.instructorProfile.upsert({
    where: { userId: BigInt(user.id) },
    create: { userId: BigInt(user.id), ...data },
    update: data,
  });
  const completion = pdsCompletion(readPds({ ...data, employeeId: data.employeeId }));
  await recordAudit({ action: 'INSTRUCTOR_PROFILE_UPDATED', actor: actorLabel(user), target: `PDS of ${user.name}`, details: { completion: completion.overall }, context });
  return completion;
}

/** The Director's list: every Diploma Instructor and how complete their PDS is. */
export async function instructorProfiles(user: AuthUser) {
  if (!teachingPolicy.viewInstructorProfiles(user)) throw new AuthorizationError();
  const roleRows = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, role: { name: 'teacher', guardName: 'web' } },
    select: { modelId: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: roleRows.map((r) => r.modelId) } },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      instructorProfile: true,
      _count: { select: { taughtClasses: true } },
    },
  });
  return users.map((u) => {
    const data = readPds(u.instructorProfile);
    return {
      id: u.id.toString(),
      name: u.name,
      email: u.email,
      status: u.status,
      employeeId: data.employeeId || null,
      classes: u._count.taughtClasses,
      completion: pdsCompletion(data).overall,
      updatedAt: u.instructorProfile?.updatedAt.toISOString() ?? null,
    };
  });
}

export async function viewInstructorPds(user: AuthUser, instructorId: bigint, context?: AuditContext) {
  if (!teachingPolicy.viewInstructorProfiles(user)) throw new AuthorizationError();
  const isInstructor = await prisma.modelHasRole.findFirst({
    where: { modelId: instructorId, modelType: USER_MODEL_TYPE, role: { name: 'teacher', guardName: 'web' } },
  });
  const target = isInstructor
    ? await prisma.user.findUnique({ where: { id: instructorId }, select: { id: true, name: true, email: true, instructorProfile: true } })
    : null;
  if (!target) throw new NotFoundError('Instructor not found.');

  await recordAudit({ action: 'INSTRUCTOR_PROFILE_VIEWED', actor: actorLabel(user), target: `PDS of ${target.name} <${target.email}>`, context });
  const data = readPds(target.instructorProfile);
  return {
    instructor: { id: target.id.toString(), name: target.name, email: target.email },
    data,
    completion: pdsCompletion(data),
    updatedAt: target.instructorProfile?.updatedAt.toISOString() ?? null,
  };
}
