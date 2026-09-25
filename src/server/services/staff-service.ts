import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { AppError, NotFoundError } from '@/lib/http';
import { hashPassword } from '@/server/auth/password';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import { destroyAllSessionsFor } from '@/server/auth/session';
import { recordAudit, actorLabel, type AuditContext } from './audit-log';
import type { AuthUser } from '@/types/domain';

/** Port of the staff/index Volt component. */

const PAGE_SIZE = 10;

/** The roles the Staff screen manages. `student` is intentionally absent. */
export const STAFF_ROLES = ['admin', 'director', 'coordinator', 'secretary', 'teacher'] as const;

/**
 * Which roles the CURRENT actor may grant.
 *
 * Only a Super Admin may grant `admin`. An Admin can staff every
 * operational role beneath them but cannot mint a peer — this is the rule
 * that stops lateral privilege escalation between admins.
 */
export function assignableRoles(actor: AuthUser): string[] {
  return actor.roles.includes('super_admin')
    ? [...STAFF_ROLES]
    : ['director', 'coordinator', 'secretary', 'teacher'];
}

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  isActive: boolean;
  role: string | null;
}

export async function listStaff(page = 1) {
  const staffRoleIds = await prisma.role.findMany({
    where: { name: { in: [...STAFF_ROLES] }, guardName: GUARD },
    select: { id: true },
  });
  const roleIds = staffRoleIds.map((r) => r.id);

  const assignments = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, roleId: { in: roleIds } },
    select: { modelId: true },
  });
  const userIds = [...new Set(assignments.map((a) => a.modelId))];

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      orderBy: { name: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, name: true, email: true, username: true, isActive: true },
    }),
    Promise.resolve(userIds.length),
  ]);

  const roles = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, modelId: { in: users.map((u) => u.id) } },
    select: { modelId: true, role: { select: { name: true } } },
  });
  const roleByUser = new Map(roles.map((r) => [r.modelId.toString(), r.role.name]));

  return {
    rows: users.map(
      (u): StaffRow => ({
        id: u.id.toString(),
        name: u.name,
        email: u.email,
        username: u.username,
        isActive: u.isActive,
        role: roleByUser.get(u.id.toString()) ?? null,
      }),
    ),
    page,
    pageSize: PAGE_SIZE,
    total,
    lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getStaffMember(id: bigint) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, username: true, isActive: true },
  });
  if (!user) throw new NotFoundError('Account not found.');

  const roles = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, modelId: id },
    select: { role: { select: { name: true } } },
  });

  return { ...user, roles: roles.map((r) => r.role.name) };
}

/**
 * Str::password(20) produced a mixed-alphabet random string. This is the
 * equivalent: 20 characters drawn uniformly from a 72-character alphabet
 * using a CSPRNG, with rejection sampling so the modulo does not skew the
 * distribution toward the earlier characters.
 */
export function generatePassword(length = 20): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
  const max = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= max) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

async function syncRole(userId: bigint, roleName: string) {
  const role = await prisma.role.findFirst({
    where: { name: roleName, guardName: GUARD },
    select: { id: true },
  });
  if (!role) throw new AppError(`The role "${roleName}" does not exist.`, 422, { role: ['That role does not exist.'] });

  // syncRoles([...]) semantics: exactly one role afterwards.
  await prisma.$transaction([
    prisma.modelHasRole.deleteMany({ where: { modelType: USER_MODEL_TYPE, modelId: userId } }),
    prisma.modelHasRole.create({
      data: { roleId: role.id, modelType: USER_MODEL_TYPE, modelId: userId },
    }),
  ]);
}

export interface CreateStaffResult {
  generatedPassword: string;
  generatedFor: string;
}

export async function createStaff(
  actor: AuthUser,
  input: { name: string; email: string; role: string },
  context: AuditContext,
): Promise<CreateStaffResult> {
  if (!assignableRoles(actor).includes(input.role)) {
    throw new AppError('You may not assign that role.', 403, { role: ['You may not assign that role.'] });
  }

  const clash = await prisma.user.findFirst({
    where: { email: { equals: input.email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (clash) throw new AppError('That email address is already in use.', 422, { email: ['That email address is already in use.'] });

  const password = generatePassword();

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      password: await hashPassword(password),
      emailVerifiedAt: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await syncRole(user.id, input.role);

  await recordAudit({
    action: 'STAFF_ACCOUNT_CREATED',
    actor: actorLabel(actor),
    target: `${user.name} <${user.email}>`,
    details: { role: input.role },
    context,
  });

  return { generatedPassword: password, generatedFor: user.email };
}

export async function updateStaff(
  actor: AuthUser,
  id: bigint,
  input: { name: string; email: string; role: string },
  context: AuditContext,
) {
  const existing = await getStaffMember(id);

  if (!assignableRoles(actor).includes(input.role)) {
    throw new AppError('You may not assign that role.', 403, { role: ['You may not assign that role.'] });
  }

  const clash = await prisma.user.findFirst({
    where: { email: { equals: input.email, mode: 'insensitive' }, id: { not: id } },
    select: { id: true },
  });
  if (clash) throw new AppError('That email address is already in use.', 422, { email: ['That email address is already in use.'] });

  const oldRole = existing.roles[0] ?? null;
  const oldEmail = existing.email;

  await prisma.user.update({
    where: { id },
    data: { name: input.name, email: input.email, updatedAt: new Date() },
  });
  await syncRole(id, input.role);

  await recordAudit({
    action: 'STAFF_ACCOUNT_UPDATED',
    actor: actorLabel(actor),
    target: `${input.name} <${input.email}>`,
    details: {
      old_role: oldRole,
      new_role: input.role,
      old_email: oldEmail,
      new_email: input.email,
    },
    context,
  });
}

/**
 * Activate or deactivate. Deactivating also destroys the target's live
 * sessions: the Laravel EnsureAccountIsActive middleware achieved the same
 * end on their next request, but revoking immediately is strictly better
 * and costs one query.
 */
export async function toggleStaffActive(actor: AuthUser, id: bigint, context: AuditContext) {
  const target = await getStaffMember(id);

  // Re-asserted here as well as in the policy, because the Gate::before
  // Super Admin grant would otherwise let a Super Admin lock themselves out.
  if (target.id.toString() === actor.id) {
    throw new AppError('You cannot deactivate your own account.', 403);
  }

  const newState = !target.isActive;
  await prisma.user.update({ where: { id }, data: { isActive: newState, updatedAt: new Date() } });

  if (!newState) await destroyAllSessionsFor(id);

  await recordAudit({
    action: newState ? 'STAFF_ACCOUNT_ACTIVATED' : 'STAFF_ACCOUNT_DEACTIVATED',
    actor: actorLabel(actor),
    target: `${target.name} <${target.email}>`,
    details: { role: target.roles[0] ?? null },
    context,
  });

  return newState;
}

export async function resetStaffPassword(
  actor: AuthUser,
  id: bigint,
  context: AuditContext,
): Promise<CreateStaffResult> {
  const target = await getStaffMember(id);
  const password = generatePassword();

  await prisma.user.update({
    where: { id },
    data: { password: await hashPassword(password), updatedAt: new Date() },
  });

  // An administrative reset invalidates existing sessions; otherwise a
  // compromised session survives the very reset meant to end it.
  await destroyAllSessionsFor(id);

  await recordAudit({
    action: 'STAFF_PASSWORD_RESET',
    actor: actorLabel(actor),
    target: `${target.name} <${target.email}>`,
    context,
  });

  return { generatedPassword: password, generatedFor: target.email };
}
