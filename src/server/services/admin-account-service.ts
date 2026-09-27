import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError, NotFoundError } from '@/lib/http';
import { hashPassword } from '@/server/auth/password';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import { destroyAllSessionsFor } from '@/server/auth/session';
import { generateTemporaryPassword } from '@/lib/temporary-password';
import { checkInstitutionalEmail } from '@/lib/institutional-email';
import {
  generateAccessCode,
  hashAccessCode,
  accessCodeExpiryFrom,
  accessCodeMaxAttempts,
  accessCodeStatus,
  resolveAccessCodeMinutes,
  secondsUntil,
  type AccessCodeStatus,
} from '@/server/auth/admin-access-code';
import { staticCodeConfigured } from '@/server/auth/super-admin-code';
import {
  sealTemporaryPassword,
  openTemporaryPassword,
  vaultConfigured,
  revealWindowHours,
  VAULT_NOT_CONFIGURED,
} from '@/server/auth/credential-vault';
import { consumeRateLimit } from '@/server/auth/rate-limit';
import { sendAdminAccessCodeEmail } from '@/server/mail/messages';
import { canSendMail } from '@/server/mail/mailer';
import { recordAudit, actorLabel, type AuditContext } from './audit-log';
import type { AuthUser, AccountStatus } from '@/types/domain';

/**
 * Administrator accounts and their access codes, run from the Super Admin
 * Dashboard.
 *
 * THE WORKFLOW
 *
 *   Admin Accounts   create an Admin (name, email, temporary password)
 *   Access Codes     generate a one-time code for that Admin, hand it over
 *   Admin            email + password → access code → new password → in
 *
 * Two separate pages for two separate things. An account has to exist before
 * a code can be issued for it, and creating an account does not issue one:
 * the code is a decision about letting someone in *now*, taken on the Access
 * Codes page, not a side effect of creating them.
 *
 * There is no approval step anywhere. A new Admin is ACTIVE from the moment it
 * exists. What holds them back is not a status somebody flips later, but two
 * facts that clear themselves as they are used: an access code they have not
 * yet been given, and `mustChangePassword` on the row.
 *
 * WHAT IS NOT ASKED FOR
 *
 * None of these operations asks for the static Super Admin security code. The
 * signed-in Super Admin Dashboard is the trust boundary: reaching this file at
 * all means a Super Admin session passed `adminAccountPolicy`. The static code
 * (src/server/auth/super-admin-code.ts) remains a separate, server-only secret
 * whose configuration the dashboard reports, and it is never accepted as, or in
 * place of, an Admin's access code.
 */

export const ADMIN_ROLE = 'admin';

/** Two states, per the brief. An Admin is never put into PENDING. */
export const ADMIN_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

/** Why a code stopped working before it was used. Stored in revoked_reason. */
export type RevokedReason =
  | 'revoked'
  | 'superseded'
  | 'attempts_exhausted'
  | 'account_suspended'
  | 'password_reset';

/**
 * `is_active` is superseded by `status` but still present in the database.
 * Every write goes through here so the two can never disagree.
 */
function stateFields(status: AccountStatus) {
  return { status, isActive: status === 'ACTIVE', updatedAt: new Date() };
}

function label(user: { name: string; email: string }): string {
  return `${user.name} <${user.email}>`;
}

async function adminRoleId(): Promise<bigint | null> {
  const role = await prisma.role.findFirst({
    where: { name: ADMIN_ROLE, guardName: GUARD },
    select: { id: true },
  });
  return role?.id ?? null;
}

/** Every user id holding the admin role. */
async function adminUserIds(): Promise<bigint[]> {
  const roleId = await adminRoleId();
  if (roleId === null) return [];
  const assignments = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, roleId },
    select: { modelId: true },
  });
  return [...new Set(assignments.map((a) => a.modelId))];
}

/**
 * Revoke every LIVE code for one Admin, in whatever transaction or client is
 * passed. Emptying the hash as well as stamping the row means a revoked code
 * cannot be matched even by a code path that forgot to check revokedAt.
 *
 * Live only: a code that has already expired cannot let anybody in, and
 * revoking it would overwrite its history — the dashboard would show
 * "Revoked, replaced" for a code that simply ran out.
 */
async function revokeUnspentCodes(
  client: Pick<typeof prisma, 'adminAccessCode'>,
  adminUserId: bigint,
  reason: RevokedReason,
  revokedBy: bigint | null,
): Promise<number> {
  const { count } = await client.adminAccessCode.updateMany({
    where: { adminUserId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { revokedAt: new Date(), revokedReason: reason, revokedBy, codeHash: '' },
  });
  return count;
}

/**
 * Keep a sealed, revealable copy of a newly issued temporary password, and wipe
 * any earlier one for the same user.
 *
 * Wiping first is what makes "reset" mean the previous temporary password can
 * no longer be shown: the old ciphertext is emptied, not merely flagged. When
 * TEMP_CREDENTIAL_KEY is not configured nothing is kept — the password is still
 * shown once in the response that issued it, and the dashboard says it cannot
 * be shown again, rather than the account operation failing.
 */
async function storeTemporaryCredential(
  client: Pick<typeof prisma, 'temporaryCredential'>,
  userId: bigint,
  plaintext: string,
  issuedBy: bigint,
  supersededReason: 'reset' | 'reissued',
): Promise<boolean> {
  await client.temporaryCredential.updateMany({
    where: { userId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: supersededReason, sealed: '' },
  });

  if (!vaultConfigured()) return false;

  await client.temporaryCredential.create({
    data: {
      userId,
      sealed: sealTemporaryPassword(plaintext, userId),
      createdBy: issuedBy,
      expiresAt: new Date(Date.now() + revealWindowHours() * 3_600_000),
    },
  });
  return true;
}

// --- Admin accounts: reading -----------------------------------------------

export interface AdminAccountRow {
  id: string;
  name: string;
  email: string;
  status: AccountStatus;
  /** Still on a Super Admin-issued temporary password. */
  mustChangePassword: boolean;
  /**
   * False for an account that has never been set up — a leftover invitation
   * with an unconfirmed address and a placeholder password. It cannot sign in
   * whatever its status says, and Reset password is the way to set it up.
   */
  setUp: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
  /** Seconds left on this Admin's live access code, or null when there is none. */
  accessCodeExpiresInSeconds: number | null;
}

const PAGE_SIZE = 10;

export async function listAdminAccounts(page = 1) {
  const userIds = await adminUserIds();

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    orderBy: { name: 'asc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      emailVerifiedAt: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  // No codeHash selected: a hash has no business leaving the server.
  const now = new Date();
  const codes = await prisma.adminAccessCode.findMany({
    where: {
      adminUserId: { in: users.map((u) => u.id) },
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { adminUserId: true, expiresAt: true },
  });
  const liveCode = new Map(codes.map((c) => [c.adminUserId.toString(), c.expiresAt]));

  return {
    rows: users.map((u): AdminAccountRow => {
      const expiry = liveCode.get(u.id.toString());
      return {
        id: u.id.toString(),
        name: u.name,
        email: u.email,
        status: u.status as AccountStatus,
        mustChangePassword: u.mustChangePassword,
        setUp: u.emailVerifiedAt !== null,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt?.toISOString() ?? null,
        accessCodeExpiresInSeconds: expiry ? secondsUntil(expiry, now) : null,
      };
    }),
    page,
    pageSize: PAGE_SIZE,
    total: userIds.length,
    lastPage: Math.max(1, Math.ceil(userIds.length / PAGE_SIZE)),
  };
}

/** Load an Admin, refusing to act on an account that is not one. */
async function getAdmin(id: bigint) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      emailVerifiedAt: true,
      mustChangePassword: true,
    },
  });
  if (!user) throw new NotFoundError('That administrator account was not found.');

  const roles = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, modelId: id },
    select: { role: { select: { name: true } } },
  });
  const roleNames = roles.map((r) => r.role.name);

  /*
   * The pages only ever offer Admins, so reaching this with anything else
   * means a hand-made request. Refused rather than quietly widened: these
   * operations issue credentials.
   */
  if (!roleNames.includes(ADMIN_ROLE)) {
    throw new AppError('That account is not an administrator account.', 422);
  }
  if (roleNames.includes('super_admin')) {
    throw new AppError('A Super Admin account cannot be managed from here.', 403);
  }

  return { ...user, roles: roleNames };
}

// --- Admin accounts: creating ----------------------------------------------

export interface CreatedAdmin {
  id: string;
  name: string;
  email: string;
  /**
   * Plaintext, in the response to the request that created it. The login
   * checks a bcrypt hash; a sealed copy is kept for reveal only while it
   * remains temporary (see credential-vault.ts).
   */
  temporaryPassword: string;
  /** Whether it can be shown again later from the dashboard. */
  revealable: boolean;
}

const CREATE_LIMIT = { max: 10, windowSeconds: 3600 };

export interface CreateAdminInput {
  name: string;
  email: string;
  /**
   * Chosen by the Super Admin or produced by the "Generate password" button.
   * Validated against the same policy as every other password and hashed here;
   * echoed back once so it can be handed over, never stored.
   */
  temporaryPassword: string;
}

/**
 * Create an Admin account with a temporary password. No access code is issued
 * here — that is done from Access Codes, as its own decision.
 *
 * ON `emailVerifiedAt`
 *
 * Set here, without a verification email. The Super Admin is typing an address
 * for a colleague they are also handing a password to, so the address is
 * asserted by them; an account that could not sign in until its holder opened
 * a link would make those credentials useless. The audit record says the
 * confirmation was administrative, so the trail does not claim the holder
 * proved anything. A mistyped address is bounded: the password is never
 * emailed, so a wrong address alone hands nobody a way in.
 */
export async function createAdminAccount(
  actor: AuthUser,
  input: CreateAdminInput,
  context: AuditContext,
): Promise<CreatedAdmin> {
  const throttle = await consumeRateLimit('admin-create', actor.id, CREATE_LIMIT);
  if (throttle.limited) {
    throw new AppError(
      'Several administrator accounts have been created from here recently. Please wait a while before creating another.',
      429,
    );
  }

  const check = checkInstitutionalEmail(input.email);
  if (!check.ok) throw new AppError(check.message!, 422, { email: [check.message!] });

  const clash = await prisma.user.findUnique({
    where: { email: check.email },
    select: { id: true },
  });
  if (clash) {
    throw new AppError('An account already exists for that email address.', 422, {
      email: ['An account already exists for that email address.'],
    });
  }

  const roleId = await adminRoleId();
  if (roleId === null) {
    throw new AppError(
      'The administrator role is missing from this database, so the account cannot be created. Run the role seeder.',
      503,
    );
  }

  const passwordHash = await hashPassword(input.temporaryPassword);

  // The account and its role together: an Admin with no role administers nothing.
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name.trim(),
        email: check.email,
        password: passwordHash,
        emailVerifiedAt: new Date(),
        mustChangePassword: true,
        ...stateFields('ACTIVE'),
        createdAt: new Date(),
      },
      select: { id: true, name: true, email: true },
    });

    await tx.modelHasRole.create({
      data: { roleId, modelType: USER_MODEL_TYPE, modelId: created.id },
    });

    const revealable = await storeTemporaryCredential(
      tx,
      created.id,
      input.temporaryPassword,
      BigInt(actor.id),
      'reissued',
    );

    return { ...created, revealable };
  });

  await recordAudit({
    action: 'ADMIN_CREATED',
    actor: actorLabel(actor),
    target: label(user),
    // That a temporary password was issued; never what it was.
    details: {
      role: ADMIN_ROLE,
      status: 'ACTIVE',
      email_confirmation: 'administrative',
      must_change_password: true,
    },
    context,
  });

  await recordAudit({
    action: 'TEMP_PASSWORD_GENERATED',
    actor: actorLabel(actor),
    target: label(user),
    // That one exists and whether it can be shown again; never the password.
    details: { reason: 'account_created', revealable: user.revealable },
    context,
  });

  return {
    id: user.id.toString(),
    name: user.name,
    email: user.email,
    temporaryPassword: input.temporaryPassword,
    revealable: user.revealable,
  };
}

// --- Admin accounts: temporary password ------------------------------------

export interface ReissuedPassword {
  adminId: string;
  name: string;
  email: string;
  temporaryPassword: string;
  /** True when this reset also set up a never-set-up account. */
  activated: boolean;
  /** Unspent access codes revoked along with the old password. */
  codesRevoked: number;
  /** Whether it can be shown again later from the dashboard. */
  revealable: boolean;
}

const PASSWORD_RESET_LIMIT = { max: 5, windowSeconds: 3600 };

/**
 * Replace an Admin's password with a fresh temporary one.
 *
 * Generated on the server rather than chosen: this path exists for "they have
 * lost it". Alongside the password it ends every session, drops any
 * half-finished sign-in, and revokes any unspent access code — the usual reason
 * for a reset is that a credential is in the wrong hands, and a code issued
 * alongside the old password is part of the same set. The Super Admin issues a
 * fresh code from Access Codes when they hand the new password over.
 *
 * It is also the repair path for an account left over from the old invitation
 * flow — unconfirmed address, placeholder password, PENDING or wrongly ACTIVE.
 * It confirms the address on the Super Admin's authority (recorded as such) and
 * activates the account. SUSPENDED and INACTIVE are left alone: those are
 * deliberate decisions a password reset must not quietly undo.
 */
export async function resetAdminTemporaryPassword(
  actor: AuthUser,
  id: bigint,
  context: AuditContext,
): Promise<ReissuedPassword> {
  const admin = await getAdmin(id);

  const throttle = await consumeRateLimit('admin-temp-password', id.toString(), PASSWORD_RESET_LIMIT);
  if (throttle.limited) {
    throw new AppError(
      'That administrator has had several temporary passwords issued recently. Please wait a while.',
      429,
    );
  }

  const temporaryPassword = generateTemporaryPassword();

  const confirmingAddress = admin.emailVerifiedAt === null;
  const activating =
    admin.status === 'PENDING' || (admin.status === 'ACTIVE' && confirmingAddress);

  const passwordHash = await hashPassword(temporaryPassword);

  const { codesRevoked, revealable } = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        password: passwordHash,
        mustChangePassword: true,
        ...(confirmingAddress ? { emailVerifiedAt: new Date() } : {}),
        ...(activating ? stateFields('ACTIVE') : { updatedAt: new Date() }),
      },
    });
    await tx.adminLoginChallenge.deleteMany({ where: { userId: id } });
    // The previous temporary password stops working (hash replaced above) AND
    // stops being revealable (ciphertext wiped here).
    const stored = await storeTemporaryCredential(tx, id, temporaryPassword, BigInt(actor.id), 'reset');
    const revoked = await revokeUnspentCodes(tx, id, 'password_reset', BigInt(actor.id));
    return { codesRevoked: revoked, revealable: stored };
  });

  await destroyAllSessionsFor(id);

  await recordAudit({
    action: 'TEMP_PASSWORD_RESET',
    actor: actorLabel(actor),
    target: label(admin),
    details: {
      must_change_password: true,
      sessions_revoked: true,
      access_codes_revoked: codesRevoked,
      from_status: admin.status,
      email_confirmation: confirmingAddress ? 'administrative' : 'already_confirmed',
      activated: activating,
      new_temporary_password_revealable: revealable,
    },
    context,
  });

  return {
    adminId: id.toString(),
    name: admin.name,
    email: admin.email,
    temporaryPassword,
    activated: activating,
    codesRevoked,
    revealable,
  };
}

// --- Admin accounts: suspension --------------------------------------------

/**
 * Suspend or reactivate an Admin.
 *
 * Suspending destroys sessions and revokes any unspent access code: the point
 * is that this person should not be in the system in a minute's time, and an
 * unspent code would be a way back in.
 */
export async function setAdminAccountStatus(
  actor: AuthUser,
  id: bigint,
  status: AdminStatus,
  context: AuditContext,
): Promise<AdminStatus> {
  const admin = await getAdmin(id);

  if (admin.id.toString() === actor.id) {
    throw new AppError('You cannot change the status of your own account.', 403);
  }

  /*
   * An account that has never been set up cannot be made ACTIVE by flipping
   * its status: the badge would say Active while every sign-in was refused.
   * Reset password sets it up and activates it in one step.
   */
  if (status === 'ACTIVE' && admin.emailVerifiedAt === null) {
    throw new AppError(
      'This account has never been set up, so activating it would not let anybody sign in. Use Reset password instead: it issues a temporary password and activates the account in one step.',
      422,
      undefined,
      'ADMIN_NOT_SET_UP',
    );
  }

  const codesRevoked = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: stateFields(status) });
    if (status === 'ACTIVE') return 0;
    await tx.adminLoginChallenge.deleteMany({ where: { userId: id } });
    return revokeUnspentCodes(tx, id, 'account_suspended', BigInt(actor.id));
  });

  if (status !== 'ACTIVE') await destroyAllSessionsFor(id);

  await recordAudit({
    action: status === 'ACTIVE' ? 'ADMIN_REACTIVATED' : 'ADMIN_SUSPENDED',
    actor: actorLabel(actor),
    target: label(admin),
    details: { from_status: admin.status, to_status: status, access_codes_revoked: codesRevoked },
    context,
  });

  return status;
}

// --- Access codes: issuing -------------------------------------------------

export interface IssuedAccessCode {
  codeId: string;
  adminId: string;
  name: string;
  email: string;
  /** Plaintext, returned once in this response and never retrievable again. */
  accessCode: string;
  status: AccessCodeStatus;
  expiresInMinutes: number;
  accessCodeExpiresInSeconds: number;
  /** Unspent codes this one superseded. */
  previousCodesRevoked: number;
  mailDelivered: boolean;
  mailDetail?: string;
}

const CODE_LIMIT_PER_ACTOR = { max: 30, windowSeconds: 3600 };
const CODE_LIMIT_PER_ADMIN = { max: 10, windowSeconds: 3600 };

/**
 * Issue a one-time access code for one Admin, revoking any unspent predecessor.
 *
 * Revoking rather than leaving both live keeps "only the newest active code
 * works" true, so a code read out last week stops working the moment a new one
 * is issued.
 *
 * The code is bound to this Admin by `adminUserId`, and verification looks
 * codes up by the id of the account that passed the password step — never by
 * the code itself — so it cannot let anybody else in.
 */
export async function generateAdminAccessCode(
  actor: AuthUser,
  adminId: bigint,
  options: { expiresInMinutes?: number | null; emailAccessCode: boolean },
  context: AuditContext,
): Promise<IssuedAccessCode> {
  const admin = await getAdmin(adminId);

  if (admin.emailVerifiedAt === null) {
    throw new AppError(
      'This account has never been set up, so an access code would not let them in. Use Reset password on Admin Accounts first: it issues a temporary password and activates the account.',
      422,
      undefined,
      'ADMIN_NOT_SET_UP',
    );
  }

  if (admin.status !== 'ACTIVE') {
    throw new AppError(
      'That account is suspended, so an access code would not let them in. Reactivate it first.',
      422,
      undefined,
      'ADMIN_SUSPENDED',
    );
  }

  const perActor = await consumeRateLimit('admin-code-generate', actor.id, CODE_LIMIT_PER_ACTOR);
  if (perActor.limited) {
    throw new AppError(
      'Too many access codes have been generated from this account recently. Please wait a while.',
      429,
    );
  }

  const perAdmin = await consumeRateLimit('admin-code-target', adminId.toString(), CODE_LIMIT_PER_ADMIN);
  if (perAdmin.limited) {
    throw new AppError(
      'Too many access codes have been generated for that administrator recently. Please wait a while.',
      429,
    );
  }

  const minutes = resolveAccessCodeMinutes(options.expiresInMinutes);
  const code = generateAccessCode();
  const codeHash = await hashAccessCode(code);
  const expiresAt = accessCodeExpiryFrom(new Date(), minutes);
  const maxAttempts = accessCodeMaxAttempts();

  const { created, superseded } = await prisma.$transaction(async (tx) => {
    // Automatic, so no person is recorded as having revoked them.
    const count = await revokeUnspentCodes(tx, adminId, 'superseded', null);
    const row = await tx.adminAccessCode.create({
      data: { adminUserId: adminId, codeHash, expiresAt, maxAttempts, createdBy: BigInt(actor.id) },
      select: { id: true },
    });
    return { created: row, superseded: count };
  });

  let mail = { delivered: false as boolean, detail: undefined as string | undefined };
  if (options.emailAccessCode) {
    const result = await sendAdminAccessCodeEmail({
      to: admin.email,
      name: admin.name,
      code,
      expiresAt,
    });
    mail = { delivered: result.delivered, detail: result.detail };
  }

  await recordAudit({
    action: 'ACCESS_CODE_GENERATED',
    actor: actorLabel(actor),
    target: label(admin),
    // The code itself is never recorded.
    details: {
      code_id: created.id.toString(),
      expires_in_minutes: minutes,
      expires_at: expiresAt.toISOString(),
      previous_codes_revoked: superseded,
      emailed: options.emailAccessCode,
      email_delivered: options.emailAccessCode ? mail.delivered : null,
    },
    context,
  });

  return {
    codeId: created.id.toString(),
    adminId: adminId.toString(),
    name: admin.name,
    email: admin.email,
    accessCode: code,
    status: 'ACTIVE',
    expiresInMinutes: minutes,
    accessCodeExpiresInSeconds: secondsUntil(expiresAt),
    previousCodesRevoked: superseded,
    mailDelivered: mail.delivered,
    mailDetail: mail.detail,
  };
}

// --- Access codes: revoking ------------------------------------------------

const REVOKE_LIMIT = { max: 60, windowSeconds: 3600 };

/**
 * Revoke one code by hand.
 *
 * Only an ACTIVE code can be revoked: a used, expired or already-revoked code
 * already cannot let anybody in, and "revoking" it would rewrite its history —
 * a USED code would stop showing that it was used.
 */
export async function revokeAdminAccessCode(
  actor: AuthUser,
  codeId: bigint,
  context: AuditContext,
): Promise<AccessCodeRow> {
  const throttle = await consumeRateLimit('admin-code-revoke', actor.id, REVOKE_LIMIT);
  if (throttle.limited) {
    throw new AppError('Too many codes have been revoked recently. Please wait a while.', 429);
  }

  const existing = await prisma.adminAccessCode.findUnique({
    where: { id: codeId },
    select: {
      id: true,
      adminUserId: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      attemptCount: true,
      maxAttempts: true,
    },
  });
  if (!existing) throw new NotFoundError('That access code was not found.');

  const status = accessCodeStatus(existing);
  if (status !== 'ACTIVE') {
    throw new AppError(
      `That code is already ${status.toLowerCase()}, so it cannot be used to sign in.`,
      409,
      undefined,
      'ACCESS_CODE_NOT_ACTIVE',
    );
  }

  // Conditional, so a code used in the same instant is not overwritten.
  const { count } = await prisma.adminAccessCode.updateMany({
    where: { id: codeId, usedAt: null, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedReason: 'revoked',
      revokedBy: BigInt(actor.id),
      codeHash: '',
    },
  });
  if (count !== 1) {
    throw new AppError('That code was used or revoked a moment ago.', 409, undefined, 'ACCESS_CODE_NOT_ACTIVE');
  }

  const admin = await prisma.user.findUnique({
    where: { id: existing.adminUserId },
    select: { name: true, email: true },
  });

  await recordAudit({
    action: 'ACCESS_CODE_REVOKED',
    actor: actorLabel(actor),
    target: admin ? label(admin) : `user #${existing.adminUserId.toString()}`,
    details: { code_id: codeId.toString() },
    context,
  });

  return (await getAccessCode(codeId))!;
}

// --- Access codes: reading -------------------------------------------------

/**
 * One code as the dashboard shows it. There is no code in it and no hash —
 * the plaintext existed once, in the response that issued it.
 */
export interface AccessCodeRow {
  id: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
  status: AccessCodeStatus;
  /** Seconds left while ACTIVE, otherwise null. */
  expiresInSeconds: number | null;
  expiresAt: string;
  createdAt: string;
  createdBy: string | null;
  usedAt: string | null;
  revokedAt: string | null;
  revokedReason: RevokedReason | null;
  revokedBy: string | null;
  attemptsUsed: number;
  maxAttempts: number;
}

const CODE_SELECT = {
  id: true,
  adminUserId: true,
  expiresAt: true,
  usedAt: true,
  revokedAt: true,
  revokedReason: true,
  revokedBy: true,
  attemptCount: true,
  maxAttempts: true,
  createdBy: true,
  createdAt: true,
} as const;

type CodeRecord = {
  id: bigint;
  adminUserId: bigint;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  revokedBy: bigint | null;
  attemptCount: number;
  maxAttempts: number;
  createdBy: bigint | null;
  createdAt: Date;
};

/** Resolve the people a page of codes refers to, in one query. */
async function describeCodes(records: CodeRecord[]): Promise<AccessCodeRow[]> {
  const ids = new Set<string>();
  for (const r of records) {
    ids.add(r.adminUserId.toString());
    if (r.createdBy) ids.add(r.createdBy.toString());
    if (r.revokedBy) ids.add(r.revokedBy.toString());
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...ids].map((i) => BigInt(i)) } },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id.toString(), u]));

  const now = new Date();
  return records.map((r) => {
    const admin = byId.get(r.adminUserId.toString());
    const status = accessCodeStatus(r, now);
    return {
      id: r.id.toString(),
      adminId: r.adminUserId.toString(),
      adminName: admin?.name ?? 'Deleted account',
      adminEmail: admin?.email ?? '',
      status,
      expiresInSeconds: status === 'ACTIVE' ? secondsUntil(r.expiresAt, now) : null,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdBy ? (byId.get(r.createdBy.toString())?.name ?? null) : null,
      usedAt: r.usedAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      revokedReason: (r.revokedReason as RevokedReason | null) ?? (status === 'REVOKED' ? 'attempts_exhausted' : null),
      revokedBy: r.revokedBy ? (byId.get(r.revokedBy.toString())?.name ?? null) : null,
      attemptsUsed: r.attemptCount,
      maxAttempts: r.maxAttempts,
    };
  });
}

const CODE_PAGE_SIZE = 20;

export async function listAccessCodes(page = 1) {
  const total = await prisma.adminAccessCode.count();
  const records = await prisma.adminAccessCode.findMany({
    orderBy: { id: 'desc' },
    skip: (page - 1) * CODE_PAGE_SIZE,
    take: CODE_PAGE_SIZE,
    select: CODE_SELECT,
  });

  return {
    rows: await describeCodes(records as CodeRecord[]),
    page,
    pageSize: CODE_PAGE_SIZE,
    total,
    lastPage: Math.max(1, Math.ceil(total / CODE_PAGE_SIZE)),
  };
}

export async function getAccessCode(codeId: bigint): Promise<AccessCodeRow | null> {
  const record = await prisma.adminAccessCode.findUnique({
    where: { id: codeId },
    select: CODE_SELECT,
  });
  if (!record) return null;
  const [row] = await describeCodes([record as CodeRecord]);
  return row ?? null;
}

/** An Admin the Generate dialog can offer, and whether it can be picked. */
export interface IssuableAdmin {
  id: string;
  name: string;
  email: string;
  /** Null when a code can be issued; otherwise why not. */
  blockedReason: string | null;
}

export async function listIssuableAdmins(): Promise<IssuableAdmin[]> {
  const users = await prisma.user.findMany({
    where: { id: { in: await adminUserIds() } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, status: true, emailVerifiedAt: true },
  });

  return users.map((u) => ({
    id: u.id.toString(),
    name: u.name,
    email: u.email,
    blockedReason:
      u.emailVerifiedAt === null
        ? 'Not set up — reset their password first'
        : u.status !== 'ACTIVE'
          ? 'Suspended'
          : null,
  }));
}

/** The numbers on the dashboard's Admin Access card. */
export interface AdminAccessOverview {
  activeAdmins: number;
  activeCodes: number;
  expiredCodes: number;
  usedCodes: number;
  revokedCodes: number;
  /** Whether SUPER_ADMIN_STATIC_CODE is set. Never its value. */
  securityCodeConfigured: boolean;
  /** Whether TEMP_CREDENTIAL_KEY is set, so temporary passwords can be shown again. */
  revealConfigured: boolean;
}

export async function adminAccessOverview(): Promise<AdminAccessOverview> {
  const now = new Date();
  const ids = await adminUserIds();

  const [activeAdmins, activeCodes, expiredCodes, usedCodes, revokedCodes] = await Promise.all([
    prisma.user.count({ where: { id: { in: ids }, status: 'ACTIVE', emailVerifiedAt: { not: null } } }),
    prisma.adminAccessCode.count({ where: { usedAt: null, revokedAt: null, expiresAt: { gt: now } } }),
    prisma.adminAccessCode.count({ where: { usedAt: null, revokedAt: null, expiresAt: { lte: now } } }),
    prisma.adminAccessCode.count({ where: { usedAt: { not: null } } }),
    prisma.adminAccessCode.count({ where: { revokedAt: { not: null } } }),
  ]);

  return {
    activeAdmins,
    activeCodes,
    expiredCodes,
    usedCodes,
    revokedCodes,
    securityCodeConfigured: staticCodeConfigured(),
    revealConfigured: vaultConfigured(),
  };
}

// --- Credentials: the view and the reveal ---------------------------------

/**
 * Whether this Admin has a temporary password the Super Admin can show.
 *
 * Deliberately precise, so the screen never draws dots for a password that
 * cannot actually be shown:
 *
 *   none         no temporary password — they chose their own (or never had
 *                one). There is nothing to show and nothing could be shown.
 *   available    a live sealed copy exists and the vault can open it.
 *   unavailable  a temporary password is in force but cannot be shown: the
 *                reveal window passed, it was issued before revealing existed
 *                or while TEMP_CREDENTIAL_KEY was unset, or the key is unset
 *                now. Resetting issues one that can be.
 */
export type TemporaryPasswordState =
  | { state: 'none' }
  | {
      state: 'available';
      issuedAt: string;
      issuedBy: string | null;
      revealExpiresInSeconds: number;
    }
  | {
      state: 'unavailable';
      reason: 'expired' | 'not_recorded' | 'vault_not_configured';
      message: string;
    };

async function liveCredential(userId: bigint) {
  return prisma.temporaryCredential.findFirst({
    where: { userId, usedAt: null, revokedAt: null },
    orderBy: { id: 'desc' },
    select: { id: true, sealed: true, createdAt: true, createdBy: true, expiresAt: true },
  });
}

async function temporaryPasswordState(user: {
  id: bigint;
  mustChangePassword: boolean;
}): Promise<TemporaryPasswordState> {
  if (!user.mustChangePassword) return { state: 'none' };

  const row = await liveCredential(user.id);
  if (!row || !row.sealed) {
    return {
      state: 'unavailable',
      reason: 'not_recorded',
      message:
        'This temporary password cannot be shown again: it was issued before passwords could be revealed, or while revealing was not configured. Reset it to issue one that can be.',
    };
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return {
      state: 'unavailable',
      reason: 'expired',
      message:
        'This temporary password can no longer be shown: the reveal window has passed. It still works for signing in. Reset it if you need to see one again.',
    };
  }
  if (!vaultConfigured()) {
    return { state: 'unavailable', reason: 'vault_not_configured', message: VAULT_NOT_CONFIGURED };
  }

  const issuer = row.createdBy
    ? await prisma.user.findUnique({ where: { id: row.createdBy }, select: { name: true } })
    : null;

  return {
    state: 'available',
    issuedAt: row.createdAt.toISOString(),
    issuedBy: issuer?.name ?? null,
    revealExpiresInSeconds: secondsUntil(row.expiresAt),
  };
}

export interface AdminCredentials {
  admin: {
    id: string;
    name: string;
    email: string;
    status: AccountStatus;
    setUp: boolean;
    mustChangePassword: boolean;
  };
  /** Status only. The password itself is fetched by revealTemporaryPassword. */
  temporaryPassword: TemporaryPasswordState;
  /** The most recently issued access code, whatever its state, or null. */
  currentCode: AccessCodeRow | null;
}

/** Everything the credentials modal shows, and no secret. */
export async function getAdminCredentials(adminId: bigint): Promise<AdminCredentials> {
  const admin = await getAdmin(adminId);

  const latest = await prisma.adminAccessCode.findFirst({
    where: { adminUserId: adminId },
    orderBy: { id: 'desc' },
    select: CODE_SELECT,
  });

  return {
    admin: {
      id: admin.id.toString(),
      name: admin.name,
      email: admin.email,
      status: admin.status as AccountStatus,
      setUp: admin.emailVerifiedAt !== null,
      mustChangePassword: admin.mustChangePassword,
    },
    temporaryPassword: await temporaryPasswordState(admin),
    currentCode: latest ? ((await describeCodes([latest as CodeRecord]))[0] ?? null) : null,
  };
}

const REVEAL_LIMIT = { max: 30, windowSeconds: 3600 };

/**
 * Show an Admin's temporary password to the Super Admin.
 *
 * Only while it is still temporary: once the Admin has chosen their own
 * password there is nothing to reveal, and a permanent password is never
 * recoverable. Every reveal is audited — the fact, never the value.
 */
export async function revealTemporaryPassword(
  actor: AuthUser,
  adminId: bigint,
  context: AuditContext,
): Promise<{ temporaryPassword: string; revealExpiresInSeconds: number }> {
  const admin = await getAdmin(adminId);

  const throttle = await consumeRateLimit('temp-password-reveal', actor.id, REVEAL_LIMIT);
  if (throttle.limited) {
    throw new AppError('Too many passwords have been revealed recently. Please wait a while.', 429);
  }

  const state = await temporaryPasswordState(admin);
  if (state.state === 'none') {
    throw new AppError(
      'This Admin has no active temporary password. They have already chosen their own, which is never shown.',
      409,
      undefined,
      'NO_TEMPORARY_PASSWORD',
    );
  }
  if (state.state === 'unavailable') {
    throw new AppError(state.message, 409, undefined, 'TEMPORARY_PASSWORD_UNAVAILABLE');
  }

  const row = (await liveCredential(adminId))!;
  const plaintext = openTemporaryPassword(row.sealed, adminId);
  if (plaintext === null) {
    // The key was rotated, or the row was tampered with: it will never open.
    await prisma.temporaryCredential.updateMany({
      where: { id: row.id },
      data: { revokedAt: new Date(), revokedReason: 'unreadable', sealed: '' },
    });
    throw new AppError(
      'This temporary password can no longer be shown (the encryption key has changed). Reset it to issue a new one.',
      409,
      undefined,
      'TEMPORARY_PASSWORD_UNAVAILABLE',
    );
  }

  await recordAudit({
    action: 'TEMP_PASSWORD_REVEALED',
    actor: actorLabel(actor),
    target: label(admin),
    details: { credential_id: row.id.toString() },
    context,
  });

  return { temporaryPassword: plaintext, revealExpiresInSeconds: secondsUntil(row.expiresAt) };
}

/**
 * Called whenever a user's password changes by their own hand: the temporary
 * credential is consumed and its sealed copy destroyed, so it can never be
 * revealed again. Returns whether there was one.
 */
export async function consumeTemporaryCredential(userId: bigint): Promise<boolean> {
  const { count } = await prisma.temporaryCredential.updateMany({
    where: { userId, usedAt: null, revokedAt: null },
    data: { usedAt: new Date(), sealed: '' },
  });
  return count > 0;
}

/** Housekeeping: empty ciphertexts whose reveal window has closed. */
export async function pruneTemporaryCredentials(): Promise<number> {
  const { count } = await prisma.temporaryCredential.updateMany({
    where: { expiresAt: { lte: new Date() }, sealed: { not: '' } },
    data: { sealed: '' },
  });
  return count;
}

/** Surfaced in the UI so the Super Admin knows whether "email it" will work. */
export function mailIsConfigured(): boolean {
  return canSendMail();
}
