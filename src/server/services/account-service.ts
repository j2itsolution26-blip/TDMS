import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError, NotFoundError } from '@/lib/http';
import { hashPassword } from '@/server/auth/password';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import { destroyAllSessionsFor } from '@/server/auth/session';
import {
  issuePasswordResetToken,
  consumeEmailVerificationToken,
  consumePasswordResetToken,
} from '@/server/auth/tokens';
import { sendPasswordResetEmail } from '@/server/mail/messages';
import { generateTemporaryPassword } from '@/lib/temporary-password';
import { canSendMail } from '@/server/mail/mailer';
import { consumeRateLimit } from '@/server/auth/rate-limit';
import { checkInstitutionalEmail } from '@/lib/institutional-email';
import { recordAudit, actorLabel, type AuditContext } from './audit-log';
import { consumeTemporaryCredential } from './admin-account-service';
import type { AuthUser, AccountStatus } from '@/types/domain';

/**
 * Staff account administration — the Admin's job.
 *
 * The Admin creates a staff account (Director, Coordinator, Secretary,
 * Teacher) directly: ACTIVE, with a temporary password shown to the Admin once.
 * The staff member signs in with it and is made to choose their own before
 * they can do anything else (`mustChangePassword`, enforced by requireUser()
 * and requireApiUser()). Staff sign-in needs no access code; that second factor
 * is for Admins only.
 *
 * No email is involved in creating an account or resetting its password, so
 * onboarding does not depend on mail delivery. Only the temporary password's
 * bcrypt hash is stored. The Admin knows it until the holder changes it, which
 * the holder is forced to do at first sign-in.
 */

/**
 * Roles the Staff screen manages.
 *
 * `student` is provisioned by enrolment, not here.
 *
 * `admin` is absent on purpose, and its absence is the point rather than an
 * oversight. An administrator account is created by a Super Admin through
 * Administration → Admin Accounts, which issues a temporary password and a
 * one-time access code together. Leaving `admin` here as well would give the
 * system two ways to create the same privileged account — one of which grants
 * it by emailing a link and asking nobody for a second factor — and the
 * weaker of two routes is the one that gets used.
 *
 * Existing Admin accounts are therefore listed and managed on their own
 * screen, not this one.
 */
export const STAFF_ROLES = ['director', 'coordinator', 'secretary', 'teacher'] as const;

/**
 * Which roles the CURRENT actor may grant.
 *
 * The same list for a Super Admin and an Admin, now that `admin` itself is
 * not grantable from here by anybody. The actor is still the argument, and
 * the function is still the single gate both call sites go through, so a
 * per-actor restriction has one place to be added rather than two to be kept
 * in step.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function assignableRoles(actor: AuthUser): string[] {
  return [...STAFF_ROLES];
}

/**
 * `is_active` is superseded by `status` but still present in the database.
 * Every write goes through here so the two can never disagree.
 */
function stateFields(status: AccountStatus) {
  return { status, isActive: status === 'ACTIVE', updatedAt: new Date() };
}

async function syncRole(userId: bigint, roleName: string) {
  const role = await prisma.role.findFirst({
    where: { name: roleName, guardName: GUARD },
    select: { id: true },
  });
  if (!role) {
    throw new AppError(`The role "${roleName}" does not exist.`, 422, {
      role: ['That role does not exist.'],
    });
  }

  await prisma.$transaction([
    prisma.modelHasRole.deleteMany({ where: { modelType: USER_MODEL_TYPE, modelId: userId } }),
    prisma.modelHasRole.create({
      data: { roleId: role.id, modelType: USER_MODEL_TYPE, modelId: userId },
    }),
  ]);
}

// --- Reading ---------------------------------------------------------------

export interface AccountRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  status: AccountStatus;
  emailVerified: boolean;
  role: string | null;
  createdAt: string | null;
}

const PAGE_SIZE = 10;

export async function listAccounts(page = 1) {
  const staffRoles = await prisma.role.findMany({
    where: { name: { in: [...STAFF_ROLES] }, guardName: GUARD },
    select: { id: true },
  });

  const assignments = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, roleId: { in: staffRoles.map((r) => r.id) } },
    select: { modelId: true },
  });
  const userIds = [...new Set(assignments.map((a) => a.modelId))];

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    orderBy: { name: 'asc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      status: true,
      emailVerifiedAt: true,
      createdAt: true,
    },
  });

  const roles = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, modelId: { in: users.map((u) => u.id) } },
    select: { modelId: true, role: { select: { name: true } } },
  });
  const roleByUser = new Map(roles.map((r) => [r.modelId.toString(), r.role.name]));

  return {
    rows: users.map(
      (u): AccountRow => ({
        id: u.id.toString(),
        name: u.name,
        email: u.email,
        username: u.username,
        status: u.status as AccountStatus,
        emailVerified: u.emailVerifiedAt !== null,
        role: roleByUser.get(u.id.toString()) ?? null,
        createdAt: u.createdAt?.toISOString() ?? null,
      }),
    ),
    page,
    pageSize: PAGE_SIZE,
    total: userIds.length,
    lastPage: Math.max(1, Math.ceil(userIds.length / PAGE_SIZE)),
  };
}

export async function getAccount(id: bigint) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      status: true,
      emailVerifiedAt: true,
    },
  });
  if (!user) throw new NotFoundError('Account not found.');

  const roles = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, modelId: id },
    select: { role: { select: { name: true } } },
  });

  return { ...user, roles: roles.map((r) => r.role.name) };
}

// --- Creation --------------------------------------------------------------

export interface CreatedStaff {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Plaintext, in this response only. The account stores a bcrypt hash. */
  temporaryPassword: string;
}

const CREATE_LIMIT_PER_ACTOR = { max: 30, windowSeconds: 3600 };

/**
 * Create a staff account with a temporary password.
 *
 * The address is confirmed on the Admin's authority rather than by an emailed
 * link — the Admin is typing it for a colleague they are also handing a
 * password to. The audit record says so, so the trail does not claim the
 * holder proved anything.
 */
export async function createStaffAccount(
  actor: AuthUser,
  input: { name: string; email: string; role: string; temporaryPassword: string },
  context: AuditContext,
): Promise<CreatedStaff> {
  if (!assignableRoles(actor).includes(input.role)) {
    throw new AppError('You may not assign that role.', 403, {
      role: ['You may not assign that role.'],
    });
  }

  const throttle = await consumeRateLimit('staff-create', actor.id, CREATE_LIMIT_PER_ACTOR);
  if (throttle.limited) {
    throw new AppError('Many accounts have been created recently. Please wait a while.', 429);
  }

  const check = checkInstitutionalEmail(input.email);
  if (!check.ok) throw new AppError(check.message!, 422, { email: [check.message!] });

  const clash = await prisma.user.findUnique({ where: { email: check.email }, select: { id: true } });
  if (clash) {
    throw new AppError('An account already exists for that email address.', 422, {
      email: ['An account already exists for that email address.'],
    });
  }

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: check.email,
      password: await hashPassword(input.temporaryPassword),
      emailVerifiedAt: new Date(),
      mustChangePassword: true,
      ...stateFields('ACTIVE'),
      createdAt: new Date(),
    },
  });

  await syncRole(user.id, input.role);

  await recordAudit({
    action: 'STAFF_CREATED',
    actor: actorLabel(actor),
    target: `${user.name} <${user.email}>`,
    // That a temporary password was issued; never what it was.
    details: {
      role: input.role,
      status: 'ACTIVE',
      email_confirmation: 'administrative',
      must_change_password: true,
    },
    context,
  });

  return {
    id: user.id.toString(),
    name: user.name,
    email: user.email,
    role: input.role,
    temporaryPassword: input.temporaryPassword,
  };
}

export async function updateAccount(
  actor: AuthUser,
  id: bigint,
  input: { name: string; email: string; role: string },
  context: AuditContext,
) {
  const existing = await getAccount(id);

  if (!assignableRoles(actor).includes(input.role)) {
    throw new AppError('You may not assign that role.', 403, {
      role: ['You may not assign that role.'],
    });
  }

  const check = checkInstitutionalEmail(input.email);
  if (!check.ok) throw new AppError(check.message!, 422, { email: [check.message!] });

  const clash = await prisma.user.findFirst({
    where: { email: check.email, id: { not: id } },
    select: { id: true },
  });
  if (clash) {
    throw new AppError('An account already exists for that email address.', 422, {
      email: ['An account already exists for that email address.'],
    });
  }

  const emailChanged = existing.email !== check.email;

  await prisma.user.update({
    where: { id },
    data: {
      name: input.name.trim(),
      email: check.email,
      /*
       * A changed address is confirmed on the Admin's authority, exactly as at
       * creation. It no longer sends the account back to pending behind an
       * emailed link the holder may never receive.
       */
      ...(emailChanged ? { emailVerifiedAt: new Date() } : {}),
      updatedAt: new Date(),
    },
  });

  await syncRole(id, input.role);

  // Any session was authenticated against the old address.
  if (emailChanged) await destroyAllSessionsFor(id);

  await recordAudit({
    action: 'ACCOUNT_UPDATED',
    actor: actorLabel(actor),
    target: `${input.name} <${check.email}>`,
    details: {
      old_role: existing.roles[0] ?? null,
      new_role: input.role,
      old_email: existing.email,
      new_email: check.email,
      email_confirmation: emailChanged ? 'administrative' : 'unchanged',
    },
    context,
  });

  return { emailChanged };
}

// --- Lifecycle -------------------------------------------------------------

/**
 * Move an account to an explicit state.
 *
 * Deactivating or suspending also destroys live sessions, so access ends at
 * once rather than whenever the session happens to expire.
 */
export async function setAccountStatus(
  actor: AuthUser,
  id: bigint,
  status: AccountStatus,
  context: AuditContext,
) {
  const target = await getAccount(id);

  // Re-asserted here as well as in the policy: the Gate::before Super Admin
  // grant would otherwise let a Super Admin lock themselves out.
  if (target.id.toString() === actor.id && status !== 'ACTIVE') {
    throw new AppError('You cannot deactivate your own account.', 403);
  }

  if (status === 'ACTIVE' && !target.emailVerifiedAt) {
    throw new AppError(
      'This account has never been set up, so activating it would not let anybody sign in. Use Reset password instead: it issues a temporary password and activates the account.',
      422,
    );
  }

  await prisma.user.update({ where: { id }, data: stateFields(status) });

  if (status !== 'ACTIVE') await destroyAllSessionsFor(id);

  await recordAudit({
    action: `ACCOUNT_${status}`,
    actor: actorLabel(actor),
    target: `${target.name} <${target.email}>`,
    details: { role: target.roles[0] ?? null, from_status: target.status, to_status: status },
    context,
  });

  return status;
}

// --- Temporary password ----------------------------------------------------

export interface ReissuedStaffPassword {
  id: string;
  name: string;
  email: string;
  /** Plaintext, in this response only. */
  temporaryPassword: string;
  /** True when this reset also set up an account that had never been set up. */
  activated: boolean;
}

const RESET_LIMIT_PER_ACCOUNT = { max: 5, windowSeconds: 3600 };
const RESET_LIMIT_PER_ACTOR = { max: 30, windowSeconds: 3600 };

/**
 * Replace a staff member's password with a fresh temporary one.
 *
 * Generated on the server and shown to the Admin once. Every session for the
 * account ends — a reset usually follows a forgotten or compromised password —
 * and the holder must choose their own at the next sign-in.
 *
 * It is also how an account left over from the old invitation flow (address
 * never confirmed, placeholder password) gets set up: the address is
 * confirmed on the Admin's authority and a PENDING account becomes ACTIVE.
 * A deliberately deactivated or suspended account is NOT reactivated by this.
 */
export async function resetStaffTemporaryPassword(
  actor: AuthUser,
  id: bigint,
  context: AuditContext,
): Promise<ReissuedStaffPassword> {
  const target = await getAccount(id);

  const perAccount = await consumeRateLimit('staff-temp-password', id.toString(), RESET_LIMIT_PER_ACCOUNT);
  const perActor = await consumeRateLimit('staff-temp-password-actor', actor.id, RESET_LIMIT_PER_ACTOR);
  if (perAccount.limited || perActor.limited) {
    throw new AppError('Several passwords have been reset recently. Please wait a while.', 429);
  }

  const temporaryPassword = generateTemporaryPassword();
  const confirmingAddress = target.emailVerifiedAt === null;
  const activating = target.status === 'PENDING';

  await prisma.user.update({
    where: { id },
    data: {
      password: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      ...(confirmingAddress ? { emailVerifiedAt: new Date() } : {}),
      ...(activating ? stateFields('ACTIVE') : { updatedAt: new Date() }),
    },
  });

  await destroyAllSessionsFor(id);

  await recordAudit({
    action: 'STAFF_PASSWORD_RESET',
    actor: actorLabel(actor),
    target: `${target.name} <${target.email}>`,
    details: {
      must_change_password: true,
      sessions_revoked: true,
      from_status: target.status,
      email_confirmation: confirmingAddress ? 'administrative' : 'already_confirmed',
      activated: activating,
    },
    context,
  });

  return {
    id: id.toString(),
    name: target.name,
    email: target.email,
    temporaryPassword,
    activated: activating,
  };
}

// --- Self-service ----------------------------------------------------------

export type VerifyResult =
  | { ok: true; email: string; needsPassword: boolean }
  | { ok: false; message: string };

/**
 * Complete verification.
 *
 * Sets emailVerifiedAt and promotes PENDING to ACTIVE. An
 * account an administrator has since deactivated or suspended is verified
 * but NOT promoted — confirming an address must not undo a deliberate
 * administrative decision.
 */
export async function verifyEmail(token: string): Promise<VerifyResult> {
  const outcome = await consumeEmailVerificationToken(token);

  if (!outcome.ok) {
    const messages: Record<typeof outcome.reason, string> = {
      invalid: 'That verification link is not valid. Ask an administrator to send a new one.',
      expired: 'That verification link has expired. Ask an administrator to send a new one.',
      used: 'That verification link has already been used. Try signing in.',
      email_changed:
        'That verification link was issued for a different email address. Ask an administrator to send a new one.',
    };
    return { ok: false, message: messages[outcome.reason] };
  }

  const user = await prisma.user.findUnique({
    where: { id: outcome.userId },
    select: { id: true, email: true, status: true },
  });
  if (!user) return { ok: false, message: 'That account no longer exists.' };

  const promote = user.status === 'PENDING';

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      ...(promote ? stateFields('ACTIVE') : { updatedAt: new Date() }),
    },
  });

  await recordAudit({
    action: 'ACCOUNT_EMAIL_VERIFIED',
    actor: 'SELF_SERVICE',
    target: user.email,
    details: { promoted_to_active: promote, previous_status: user.status },
  });

  /*
   * An invited account still has the unusable placeholder password, so it
   * needs to set one before it can sign in. A reset token is issued and the
   * caller redirects to the reset screen — the verification click is itself
   * the proof of address ownership that justifies it.
   */
  const invited = promote;
  return { ok: true, email: user.email, needsPassword: invited };
}

/**
 * Begin a self-service password reset.
 *
 * Always reports success. Revealing whether an address has an account would
 * make this an account-enumeration oracle, and the whole form is reachable
 * without signing in.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const check = checkInstitutionalEmail(rawEmail);
  // A non-institutional address cannot have an account; stop without a hint.
  if (!check.ok) return;

  const user = await prisma.user.findUnique({
    where: { email: check.email },
    select: { id: true, name: true, email: true, status: true, emailVerifiedAt: true },
  });

  // Silent for unknown, unverified, or non-active accounts alike.
  if (!user || !user.emailVerifiedAt || user.status !== 'ACTIVE') return;

  const { token, expiresAt } = await issuePasswordResetToken(user.id);
  await sendPasswordResetEmail({ to: user.email, name: user.name, token, expiresAt });
}

export type ResetPasswordResult = { ok: true } | { ok: false; message: string };

export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<ResetPasswordResult> {
  const outcome = await consumePasswordResetToken(token);

  if (!outcome.ok) {
    const messages: Record<typeof outcome.reason, string> = {
      invalid: 'That reset link is not valid. Request a new one.',
      expired: 'That reset link has expired. Request a new one.',
      used: 'That reset link has already been used. Request a new one.',
    };
    return { ok: false, message: messages[outcome.reason] };
  }

  const user = await prisma.user.findUnique({
    where: { id: outcome.userId },
    select: { id: true, email: true, status: true, emailVerifiedAt: true },
  });
  if (!user) return { ok: false, message: 'That account no longer exists.' };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: await hashPassword(newPassword),
      // A password chosen through the emailed link is the user's own, so any
      // temporary one issued by a Super Admin is finished with.
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      // Setting a password through a link sent to the verified address both
      // proves ownership and completes an invitation.
      ...(user.emailVerifiedAt && user.status === 'PENDING'
        ? stateFields('ACTIVE')
        : { updatedAt: new Date() }),
    },
  });

  // ...and its revealable copy is destroyed.
  await consumeTemporaryCredential(user.id);

  // Every other session was authenticated with the old password.
  await destroyAllSessionsFor(user.id);

  await recordAudit({
    action: 'ACCOUNT_PASSWORD_RESET_COMPLETED',
    actor: 'SELF_SERVICE',
    target: user.email,
  });

  return { ok: true };
}

/** Surfaced in the UI so an administrator knows whether invites will arrive. */
export function mailIsConfigured(): boolean {
  return canSendMail();
}
