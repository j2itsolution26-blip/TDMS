import type { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AuthorizationError, NotFoundError } from '@/server/lib/http';
import { pdsCompletion, readPds } from '@shared/lib/pds';
import { ROLE_LABELS, type AuthUser, type RoleName } from '@shared/types/domain';
import { USER_MODEL_TYPE } from '@/server/auth/rbac';
import { PDS_ROLES, staffPdsPolicy } from '@/server/auth/policies';
import { actorLabel, recordAudit, type AuditContext } from '@/server/services/audit-log';
import type { pdsSchema } from '@/server/schemas/teaching';

/**
 * The staff Personal Data Sheet.
 *
 * Kept by the Diploma Instructor, Coordinator, Secretary and Assessment
 * Center Manager, each for themselves (staffPdsPolicy.keepOwn). Read by the
 * Director (every such sheet) and the Admin (the Secretary's), and every read
 * is written to the audit trail — it is personal data (birth date, address,
 * family), so who looked at it, and when, is on record. The audit entries
 * name the sheet, never its contents.
 *
 * Stored in instructor_profiles, one row per user: the table predates the
 * other roles keeping a PDS, and its columns are not role-specific.
 */

function requireKeeper(user: AuthUser) {
  if (!staffPdsPolicy.keepOwn(user)) throw new AuthorizationError();
}

export async function ownPds(user: AuthUser) {
  requireKeeper(user);
  const row = await prisma.instructorProfile.findUnique({ where: { userId: BigInt(user.id) } });
  const data = readPds(row);
  return { data, completion: pdsCompletion(data), updatedAt: row?.updatedAt.toISOString() ?? null };
}

export async function saveOwnPds(user: AuthUser, input: z.output<typeof pdsSchema>, context?: AuditContext) {
  requireKeeper(user);
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
  // The original action name is kept for the Instructor so existing audit filters still find it.
  await recordAudit({ action: 'INSTRUCTOR_PROFILE_UPDATED', actor: actorLabel(user), target: `PDS of ${user.name}`, details: { completion: completion.overall }, context });
  return completion;
}

/** Each user's PDS-keeping roles, for the users holding any of `roles`. */
async function pdsRolesByUser(roles: readonly string[], userIds?: bigint[]) {
  const rows = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, role: { name: { in: [...roles] }, guardName: 'web' }, ...(userIds ? { modelId: { in: userIds } } : {}) },
    select: { modelId: true, role: { select: { name: true } } },
  });
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.modelId.toString(), [...(map.get(r.modelId.toString()) ?? []), r.role.name]);
  return map;
}

const roleLabels = (roles: string[]) => roles.map((r) => ROLE_LABELS[r as RoleName] ?? r);

/** The staff whose sheets this viewer may read, with how complete each is. */
export async function staffProfiles(user: AuthUser) {
  if (!staffPdsPolicy.viewAny(user)) throw new AuthorizationError();
  const readable = staffPdsPolicy.readableRoles(user);
  const byUser = await pdsRolesByUser(readable);
  byUser.delete(user.id);
  const users = await prisma.user.findMany({
    where: { id: { in: [...byUser.keys()].map(BigInt) } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, status: true, instructorProfile: true, _count: { select: { taughtClasses: true } } },
  });
  return {
    roles: readable.map((r) => ({ value: r, label: ROLE_LABELS[r as RoleName] ?? r })),
    rows: users.map((u) => {
      const data = readPds(u.instructorProfile);
      const roles = byUser.get(u.id.toString()) ?? [];
      return {
        id: u.id.toString(),
        name: u.name,
        email: u.email,
        status: u.status,
        roles,
        roleLabels: roleLabels(roles),
        employeeId: data.employeeId || null,
        classes: roles.includes('teacher') ? u._count.taughtClasses : null,
        completion: pdsCompletion(data).overall,
        updatedAt: u.instructorProfile?.updatedAt.toISOString() ?? null,
      };
    }),
  };
}

/** One staff member's sheet, read-only. Answers 404 for anyone the viewer may not read, so ids cannot be probed. */
export async function viewStaffPds(user: AuthUser, staffId: bigint, context?: AuditContext) {
  if (!staffPdsPolicy.viewAny(user)) throw new AuthorizationError();
  const roles = (await pdsRolesByUser(PDS_ROLES, [staffId])).get(staffId.toString()) ?? [];
  if (!staffPdsPolicy.view(user, { id: staffId.toString(), roles })) throw new NotFoundError('Staff profile not found.');
  const target = await prisma.user.findUnique({ where: { id: staffId }, select: { id: true, name: true, email: true, instructorProfile: true } });
  if (!target) throw new NotFoundError('Staff profile not found.');

  await recordAudit({ action: 'INSTRUCTOR_PROFILE_VIEWED', actor: actorLabel(user), target: `PDS of ${target.name} <${target.email}>`, details: { roles }, context });
  const data = readPds(target.instructorProfile);
  return {
    instructor: { id: target.id.toString(), name: target.name, email: target.email, roleLabels: roleLabels(roles) },
    data,
    completion: pdsCompletion(data),
    updatedAt: target.instructorProfile?.updatedAt.toISOString() ?? null,
  };
}
