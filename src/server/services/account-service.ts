import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError, NotFoundError } from '@/lib/http';
import { hashPassword } from '@/server/auth/password';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import { destroyAllSessionsFor } from '@/server/auth/session';
import {
  issueEmailVerificationToken,
  issuePasswordResetToken,
  consumeEmailVerificationToken,
  consumePasswordResetToken,
} from '@/server/auth/tokens';
import { sendVerificationEmail, sendPasswordResetEmail } from '@/server/mail/messages';
import { canSendMail } from '@/server/mail/mailer';
import { checkInstitutionalEmail } from '@/lib/institutional-email';
import { recordAudit, actorLabel, type AuditContext } from './audit-log';
import type { AuthUser, AccountStatus } from '@/types/domain';

/**
 * Account administration and the account lifecycle.
 *
 * No function here ever invents a password. An account is created without
 * one and the person sets their own through a verification link — which is
 * also what proves they control the address. That removes the two things the
 * old flow relied on: a generated password read off a screen, and an
 * administrator who therefore knew it.
 */

/** Roles the Staff screen manages. `student` is provisioned by enrolment. */
export const STAFF_ROLES = ['admin', 'director', 'coordinator', 'secretary', 'teacher'] as const;

/**
 * Which roles the CURRENT actor may grant. Only a Super Admin may grant
 * `admin`; an Admin can staff the operational roles beneath them but cannot
 * mint a peer.
 */
export function assignableRoles(actor: AuthUser): string[] {
  return actor.roles.includes('super_admin')
    ? [...STAFF_ROLES]
    : ['director', 'coordinator', 'secretary', 'teacher'];
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

// --- Invitation ------------------------------------------------------------

export interface InviteResult {
  id: string;
  email: string;
  mailDelivered: boolean;
  mailDetail?: string;
}

/**
 * Invite a member of staff.
 *
 * The account is created PENDING_VERIFICATION with an unusable password
 * placeholder — a random value that is hashed and immediately forgotten, so
 * the row is never password-less and nobody, including the administrator who
 * created it, can sign in as this person. The invitee sets their own
 * password through the verification link.
 */
export async function inviteAccount(
  actor: AuthUser,
  input: { name: string; email: string; role: string },
  context: AuditContext,
): Promise<InviteResult> {
  if (!assignableRoles(actor).includes(input.role)) {
    throw new AppError('You may not assign that role.', 403, {
      role: ['You may not assign that role.'],
    });
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
      // Unusable by construction: the plaintext is discarded on this line.
      password: await hashPassword(crypto.randomUUID() + crypto.randomUUID()),
      emailVerifiedAt: null,
      ...stateFields('PENDING_VERIFICATION'),
      createdAt: new Date(),
    },
  });

  await syncRole(user.id, input.role);

  const { token, expiresAt } = await issueEmailVerificationToken(user.id, user.email);
  const mail = await sendVerificationEmail({
    to: user.email,
    name: user.name,
    token,
    expiresAt,
  });

  await recordAudit({
    action: 'ACCOUNT_INVITED',
    actor: actorLabel(actor),
    target: `${user.name} <${user.email}>`,
    details: { role: input.role, mail_transport: mail.transport, mail_delivered: mail.delivered },
    context,
  });

  return {
    id: user.id.toString(),
    email: user.email,
    mailDelivered: mail.delivered,
    mailDetail: mail.detail,
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
      // A new address is unproven, so it must be verified again and the
      // account returns to pending until it is.
      ...(emailChanged
        ? { emailVerifiedAt: null, ...stateFields('PENDING_VERIFICATION') }
        : { updatedAt: new Date() }),
    },
  });

  await syncRole(id, input.role);

  if (emailChanged) {
    // Any session was authenticated against the old address.
    await destroyAllSessionsFor(id);
    const { token, expiresAt } = await issueEmailVerificationToken(id, check.email);
    await sendVerificationEmail({ to: check.email, name: input.name, token, expiresAt });
  }

  await recordAudit({
    action: 'ACCOUNT_UPDATED',
    actor: actorLabel(actor),
    target: `${input.name} <${check.email}>`,
    details: {
      old_role: existing.roles[0] ?? null,
      new_role: input.role,
      old_email: existing.email,
      new_email: check.email,
      email_reverification_required: emailChanged,
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
      'This account cannot be activated until its institutional email is verified. Resend the verification email instead.',
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

/** Re-send the verification email for an account that has not confirmed. */
export async function resendVerification(
  actor: AuthUser,
  id: bigint,
  context: AuditContext,
): Promise<{ mailDelivered: boolean; mailDetail?: string }> {
  const target = await getAccount(id);

  if (target.emailVerifiedAt) {
    throw new AppError('That account has already verified its email address.', 422);
  }

  const { token, expiresAt } = await issueEmailVerificationToken(id, target.email);
  const mail = await sendVerificationEmail({
    to: target.email,
    name: target.name,
    token,
    expiresAt,
  });

  await recordAudit({
    action: 'ACCOUNT_VERIFICATION_RESENT',
    actor: actorLabel(actor),
    target: `${target.name} <${target.email}>`,
    details: { mail_transport: mail.transport, mail_delivered: mail.delivered },
    context,
  });

  return { mailDelivered: mail.delivered, mailDetail: mail.detail };
}

/**
 * Administrator-initiated password reset.
 *
 * Sends a reset link to the verified institutional address rather than
 * generating a password. The administrator never learns the new one, which
 * is the point.
 */
export async function sendAdminPasswordReset(
  actor: AuthUser,
  id: bigint,
  context: AuditContext,
): Promise<{ mailDelivered: boolean; mailDetail?: string }> {
  const target = await getAccount(id);

  if (!target.emailVerifiedAt) {
    throw new AppError(
      'That account has not verified its email address yet, so a reset link cannot be sent. Resend the verification email instead.',
      422,
    );
  }

  const { token, expiresAt } = await issuePasswordResetToken(id);
  const mail = await sendPasswordResetEmail({
    to: target.email,
    name: target.name,
    token,
    expiresAt,
  });

  // Force re-authentication everywhere; an admin reset usually follows a
  // suspected compromise.
  await destroyAllSessionsFor(id);

  await recordAudit({
    action: 'ACCOUNT_PASSWORD_RESET_SENT',
    actor: actorLabel(actor),
    target: `${target.name} <${target.email}>`,
    details: { mail_transport: mail.transport, mail_delivered: mail.delivered },
    context,
  });

  return { mailDelivered: mail.delivered, mailDetail: mail.detail };
}

// --- Self-service ----------------------------------------------------------

export type VerifyResult =
  | { ok: true; email: string; needsPassword: boolean }
  | { ok: false; message: string };

/**
 * Complete verification.
 *
 * Sets emailVerifiedAt and promotes PENDING_VERIFICATION to ACTIVE. An
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

  const promote = user.status === 'PENDING_VERIFICATION';

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
      // Setting a password through a link sent to the verified address both
      // proves ownership and completes an invitation.
      ...(user.emailVerifiedAt && user.status === 'PENDING_VERIFICATION'
        ? stateFields('ACTIVE')
        : { updatedAt: new Date() }),
    },
  });

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
