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
  secondsUntil,
} from '@/server/auth/admin-access-code';
import {
  staticCodeConfigured,
  verifyStaticCode,
  STATIC_CODE_NOT_CONFIGURED,
  STATIC_CODE_REJECTED,
} from '@/server/auth/super-admin-code';
import { consumeRateLimit, clearRateLimit } from '@/server/auth/rate-limit';
import { sendAdminAccessCodeEmail } from '@/server/mail/messages';
import { canSendMail } from '@/server/mail/mailer';
import { recordAudit, actorLabel, type AuditContext } from './audit-log';
import type { AuthUser, AccountStatus } from '@/types/domain';

/**
 * Administrator accounts, as created and controlled by a Super Admin.
 *
 * THE WORKFLOW THIS IMPLEMENTS
 *
 *   Super Admin → create Admin (name, email, temporary password)
 *               → issue a one-time access code
 *               → hand both over
 *   Admin       → sign in with email + temporary password
 *               → enter the access code
 *               → choose a permanent password
 *               → in.
 *
 * There is no approval step anywhere in it. A new Admin is ACTIVE from the
 * moment it exists, because "is this account allowed to exist" was decided by
 * the Super Admin who created it. What holds the Admin back is not a status
 * to be flipped by somebody later, but two facts that clear themselves as
 * they are used: an unspent access code, and `mustChangePassword` on the row.
 *
 * WHY THE SECURITY CODE IS ON THE CREDENTIAL-ISSUING OPERATIONS
 *
 * Creating an Admin, minting an access code and resetting a temporary
 * password are the three things in this file that hand somebody a working
 * credential. Each therefore asks for the static Super Admin security code —
 * a secret held by the system owner in the server environment, not in this
 * database (see src/server/auth/super-admin-code.ts). A borrowed Super Admin
 * session is then not enough to create an administrator.
 *
 * Suspending and reactivating deliberately do NOT ask for it. They issue
 * nothing, they are reversible, and suspending an account is the action you
 * least want somebody to hesitate over.
 */

export const ADMIN_ROLE = 'admin';

/** Two states, per the brief. An Admin is never put into PENDING. */
export const ADMIN_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

/**
 * `is_active` is superseded by `status` but still present in the database.
 * Every write goes through here so the two can never disagree.
 */
function stateFields(status: AccountStatus) {
  return { status, isActive: status === 'ACTIVE', updatedAt: new Date() };
}

// --- The security-code gate ------------------------------------------------

/**
 * Budget for wrong security codes.
 *
 * Per actor, not per IP: the actor is already authenticated, so there is no
 * anonymity to defeat, and the thing being protected against is somebody who
 * has a Super Admin session and is guessing at the code the session does not
 * give them.
 */
const SECURITY_CODE_LIMIT = { max: 5, windowSeconds: 900 };

/**
 * Refuse unless the submitted security code is the configured one.
 *
 * "Not configured" and "wrong" are reported as different things on purpose.
 * Collapsing them would have an operator who simply has not set the variable
 * hunting for a code that does not exist, and the fix for that is almost
 * always to delete the check.
 */
async function requireSecurityCode(
  actor: AuthUser,
  submitted: string,
  action: string,
  context: AuditContext,
): Promise<void> {
  if (!staticCodeConfigured()) {
    throw new AppError(STATIC_CODE_NOT_CONFIGURED, 503, undefined, 'SECURITY_CODE_NOT_CONFIGURED');
  }

  const throttle = await consumeRateLimit('super-admin-code', actor.id, SECURITY_CODE_LIMIT);
  if (throttle.limited) {
    throw new AppError(
      `Too many incorrect security codes. Try again in ${throttle.retryAfterSeconds} seconds.`,
      429,
      undefined,
      'SECURITY_CODE_THROTTLED',
    );
  }

  if (!verifyStaticCode(submitted)) {
    /*
     * Audited, because a wrong security code on a privileged operation is
     * exactly the event somebody reviewing this trail is looking for. The
     * submitted value is NOT recorded — an audit table full of near-miss
     * guesses is a wordlist for the real code.
     */
    await recordAudit({
      action: 'SUPER_ADMIN_SECURITY_CODE_REJECTED',
      actor: actorLabel(actor),
      target: action,
      details: { attempted_action: action },
      context,
    });

    throw new AppError(STATIC_CODE_REJECTED, 403, { securityCode: [STATIC_CODE_REJECTED] }, 'SECURITY_CODE_REJECTED');
  }

  // A correct code clears the budget, so an operator who mistyped once and
  // then got it right is not still one slip from a lockout.
  await clearRateLimit('super-admin-code', actor.id);
}

// --- Reading ---------------------------------------------------------------

export interface AdminAccountRow {
  id: string;
  name: string;
  email: string;
  status: AccountStatus;
  /** Still on a Super Admin-issued temporary password. */
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
  /**
   * Seconds left on this Admin's live access code, or null when they have
   * none. Never the code itself, and never its hash — this is what the
   * screen needs to say "expires in 09:42" and nothing more.
   */
  accessCodeExpiresInSeconds: number | null;
}

const PAGE_SIZE = 10;

async function adminRoleId(): Promise<bigint | null> {
  const role = await prisma.role.findFirst({
    where: { name: ADMIN_ROLE, guardName: GUARD },
    select: { id: true },
  });
  return role?.id ?? null;
}

export async function listAdminAccounts(page = 1) {
  const roleId = await adminRoleId();
  if (roleId === null) {
    // The role is seeded, so this only happens on an un-seeded database.
    return { rows: [], page: 1, pageSize: PAGE_SIZE, total: 0, lastPage: 1 };
  }

  const assignments = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, roleId },
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
      status: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  /*
   * The live code for each listed admin, if any. Selected without codeHash:
   * a hash has no business leaving the server, and not selecting it is a
   * stronger guarantee than remembering to strip it later.
   */
  const now = new Date();
  const codes = await prisma.adminAccessCode.findMany({
    where: {
      adminUserId: { in: users.map((u) => u.id) },
      usedAt: null,
      invalidatedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
    select: { adminUserId: true, expiresAt: true, attemptCount: true, maxAttempts: true },
  });

  const liveCode = new Map<string, Date>();
  for (const code of codes) {
    const key = code.adminUserId.toString();
    // findMany is newest-first, so the first entry per admin is the current
    // one. A code that has run out of attempts is not offered as live.
    if (liveCode.has(key)) continue;
    if (code.attemptCount >= code.maxAttempts) continue;
    liveCode.set(key, code.expiresAt);
  }

  return {
    rows: users.map((u): AdminAccountRow => {
      const expiry = liveCode.get(u.id.toString());
      return {
        id: u.id.toString(),
        name: u.name,
        email: u.email,
        status: u.status as AccountStatus,
        mustChangePassword: u.mustChangePassword,
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
   * The screen only ever lists Admins, so reaching this with anything else
   * means a hand-made request. Refused rather than quietly widened: these
   * operations issue credentials, and "works on any account if you know an
   * id" is not a property to leave lying around.
   */
  if (!roleNames.includes(ADMIN_ROLE)) {
    throw new AppError('That account is not an administrator account.', 422);
  }
  if (roleNames.includes('super_admin')) {
    throw new AppError('A Super Admin account cannot be managed from this screen.', 403);
  }

  return { ...user, roles: roleNames };
}

// --- Creation --------------------------------------------------------------

/** What is shown to the Super Admin ONCE, and never retrievable again. */
export interface IssuedCredentials {
  id: string;
  name: string;
  email: string;
  /**
   * Plaintext, returned exactly once in the response to the request that
   * created it. Only the bcrypt hash is stored.
   */
  temporaryPassword: string;
  /** Likewise plaintext and one-shot. Only the bcrypt hash is stored. */
  accessCode: string;
  accessCodeExpiresInSeconds: number;
  /** Whether the code was also emailed, and why not if it was not. */
  mailDelivered: boolean;
  mailDetail?: string;
}

const CREATE_LIMIT = { max: 10, windowSeconds: 3600 };

export interface CreateAdminInput {
  name: string;
  email: string;
  /**
   * Chosen by the Super Admin, or generated in the browser by the "Generate
   * password" button. Either way it is validated against the same policy as
   * any other password and hashed here; the plaintext is echoed back once so
   * it can be handed over, and never stored.
   */
  temporaryPassword: string;
  securityCode: string;
  /** Also email the access code to the Admin. Never the password. */
  emailAccessCode: boolean;
}

/**
 * Create an Admin account, with a temporary password and a first access code.
 *
 * ON `emailVerifiedAt`
 *
 * It is set here, without sending a verification email, and that is a
 * deliberate difference from a staff invitation. The Super Admin is typing an
 * address for a colleague they are also handing a password to in person — the
 * address is asserted by them, and an account that cannot sign in until its
 * holder opens a link would make the credentials they were just given
 * useless. The audit record says the confirmation was administrative, so the
 * trail does not claim the holder proved anything.
 *
 * A mistyped address is therefore possible, and is bounded: the temporary
 * password is never emailed, so a wrong address on its own hands nobody a way
 * in — it can at most receive an access code that is useless without it.
 */
export async function createAdminAccount(
  actor: AuthUser,
  input: CreateAdminInput,
  context: AuditContext,
): Promise<IssuedCredentials> {
  await requireSecurityCode(actor, input.securityCode, 'ADMIN_CREATED', context);

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

  const code = generateAccessCode();
  const codeHash = await hashAccessCode(code);
  const passwordHash = await hashPassword(input.temporaryPassword);
  const expiresAt = accessCodeExpiryFrom();
  const maxAttempts = accessCodeMaxAttempts();

  /*
   * One transaction for the account, its role and its first code. Half of
   * this is not a useful outcome: an Admin with no role administers nothing,
   * and an Admin with no code cannot sign in but also cannot be told why.
   */
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name.trim(),
        email: check.email,
        password: passwordHash,
        // Administratively confirmed — see the note above.
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

    await tx.adminAccessCode.create({
      data: {
        adminUserId: created.id,
        codeHash,
        expiresAt,
        maxAttempts,
        createdBy: BigInt(actor.id),
      },
    });

    return created;
  });

  let mail = { delivered: false as boolean, detail: undefined as string | undefined };
  if (input.emailAccessCode) {
    const result = await sendAdminAccessCodeEmail({
      to: user.email,
      name: user.name,
      code,
      expiresAt,
    });
    mail = { delivered: result.delivered, detail: result.detail };
  }

  await recordAudit({
    action: 'ADMIN_CREATED',
    actor: actorLabel(actor),
    target: `${user.name} <${user.email}>`,
    /*
     * No password, no code, no hash of either. What is recorded is that they
     * were issued, which is the fact an auditor needs.
     */
    details: {
      role: ADMIN_ROLE,
      status: 'ACTIVE',
      email_confirmation: 'administrative',
      must_change_password: true,
      access_code_issued: true,
      access_code_expires_at: expiresAt.toISOString(),
      access_code_emailed: input.emailAccessCode,
      access_code_email_delivered: input.emailAccessCode ? mail.delivered : null,
    },
    context,
  });

  await recordAudit({
    action: 'ADMIN_ACCESS_CODE_GENERATED',
    actor: actorLabel(actor),
    target: `${user.name} <${user.email}>`,
    details: { reason: 'account_created', expires_at: expiresAt.toISOString() },
    context,
  });

  return {
    id: user.id.toString(),
    name: user.name,
    email: user.email,
    temporaryPassword: input.temporaryPassword,
    accessCode: code,
    accessCodeExpiresInSeconds: secondsUntil(expiresAt),
    mailDelivered: mail.delivered,
    mailDetail: mail.detail,
  };
}

// --- Access codes ----------------------------------------------------------

export interface IssuedAccessCode {
  adminId: string;
  name: string;
  email: string;
  accessCode: string;
  accessCodeExpiresInSeconds: number;
  mailDelivered: boolean;
  mailDetail?: string;
}

const CODE_LIMIT_PER_ACTOR = { max: 30, windowSeconds: 3600 };
const CODE_LIMIT_PER_ADMIN = { max: 10, windowSeconds: 3600 };

/**
 * Issue a fresh access code for an Admin, cancelling any unused predecessor.
 *
 * Cancelling rather than leaving both live is what keeps "one code, one
 * sign-in" true. Two live codes would mean an older one still works after
 * the Super Admin believed they had replaced it — which is the failure mode
 * where a code read out over the phone last week is still a way in.
 */
export async function generateAdminAccessCode(
  actor: AuthUser,
  id: bigint,
  options: { securityCode: string; emailAccessCode: boolean },
  context: AuditContext,
): Promise<IssuedAccessCode> {
  const admin = await getAdmin(id);

  await requireSecurityCode(actor, options.securityCode, 'ADMIN_ACCESS_CODE_GENERATED', context);

  if (admin.status !== 'ACTIVE') {
    throw new AppError(
      'That account is suspended, so an access code would not let them in. Reactivate it first.',
      422,
    );
  }

  const perActor = await consumeRateLimit('admin-code-generate', actor.id, CODE_LIMIT_PER_ACTOR);
  if (perActor.limited) {
    throw new AppError(
      'Too many access codes have been generated from this account recently. Please wait a while.',
      429,
    );
  }

  const perAdmin = await consumeRateLimit('admin-code-target', id.toString(), CODE_LIMIT_PER_ADMIN);
  if (perAdmin.limited) {
    throw new AppError(
      'Too many access codes have been generated for that administrator recently. Please wait a while.',
      429,
    );
  }

  const code = generateAccessCode();
  const codeHash = await hashAccessCode(code);
  const expiresAt = accessCodeExpiryFrom();
  const maxAttempts = accessCodeMaxAttempts();
  const now = new Date();

  const superseded = await prisma.$transaction(async (tx) => {
    const { count } = await tx.adminAccessCode.updateMany({
      where: { adminUserId: id, usedAt: null, invalidatedAt: null },
      data: {
        invalidatedAt: now,
        /*
         * Emptying the hash as well as stamping the row means a superseded
         * code cannot be matched even by a code path that forgot to check
         * `invalidatedAt`. accessCodeMatches() reads an empty hash as "wrong
         * code", so the failure is clean.
         */
        codeHash: '',
      },
    });

    await tx.adminAccessCode.create({
      data: { adminUserId: id, codeHash, expiresAt, maxAttempts, createdBy: BigInt(actor.id) },
    });

    return count;
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
    action: 'ADMIN_ACCESS_CODE_GENERATED',
    actor: actorLabel(actor),
    target: `${admin.name} <${admin.email}>`,
    details: {
      reason: 'reissued',
      expires_at: expiresAt.toISOString(),
      previous_codes_invalidated: superseded,
      emailed: options.emailAccessCode,
      email_delivered: options.emailAccessCode ? mail.delivered : null,
    },
    context,
  });

  return {
    adminId: id.toString(),
    name: admin.name,
    email: admin.email,
    accessCode: code,
    accessCodeExpiresInSeconds: secondsUntil(expiresAt),
    mailDelivered: mail.delivered,
    mailDetail: mail.detail,
  };
}

// --- Temporary password ----------------------------------------------------

export interface ReissuedPassword {
  adminId: string;
  name: string;
  email: string;
  temporaryPassword: string;
  /** True when this reset also brought an account out of PENDING. */
  activated: boolean;
}

const PASSWORD_RESET_LIMIT = { max: 5, windowSeconds: 3600 };

/**
 * Replace an Admin's password with a fresh temporary one.
 *
 * Every live session for that account is destroyed, because the usual reason
 * for doing this is that the old credential is believed to be in the wrong
 * hands, and leaving a session alive would make the reset cosmetic.
 *
 * The new password is generated on the server here rather than accepted from
 * the request: this path exists for "they have lost it", and there is no
 * reason for a Super Admin to choose the replacement by hand.
 *
 * IT IS ALSO THE REPAIR PATH FOR AN ACCOUNT LEFT OVER FROM THE OLD FLOW.
 *
 * An Admin invited under the previous scheme sits at PENDING with an unusable
 * placeholder password and an unconfirmed address, waiting on an email that may
 * never have arrived. Handing it a temporary password alone would not help: the
 * sign-in check also requires a confirmed address, so the person would be given
 * working credentials and still be refused, with no button anywhere to fix it.
 *
 * So this confirms the address administratively and moves PENDING to ACTIVE, on
 * exactly the reasoning that applies when an account is created here: the Super
 * Admin is typing an address for somebody they are handing a password to, so the
 * address is asserted by them. The audit record says the confirmation was
 * administrative, so the trail does not claim the holder proved anything.
 *
 * It does NOT touch INACTIVE or SUSPENDED. Those are deliberate administrative
 * decisions, and reissuing a password must not quietly undo one — reactivating
 * is its own action, with its own audit entry.
 */
export async function resetAdminTemporaryPassword(
  actor: AuthUser,
  id: bigint,
  options: { securityCode: string },
  context: AuditContext,
): Promise<ReissuedPassword> {
  const admin = await getAdmin(id);

  await requireSecurityCode(actor, options.securityCode, 'ADMIN_TEMP_PASSWORD_RESET', context);

  const throttle = await consumeRateLimit(
    'admin-temp-password',
    id.toString(),
    PASSWORD_RESET_LIMIT,
  );
  if (throttle.limited) {
    throw new AppError(
      'That administrator has had several temporary passwords issued recently. Please wait a while.',
      429,
    );
  }

  const temporaryPassword = generateTemporaryPassword();

  const confirmingAddress = admin.emailVerifiedAt === null;
  const promotingFromPending = admin.status === 'PENDING';

  await prisma.user.update({
    where: { id },
    data: {
      password: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      ...(confirmingAddress ? { emailVerifiedAt: new Date() } : {}),
      ...(promotingFromPending ? stateFields('ACTIVE') : { updatedAt: new Date() }),
    },
  });

  await destroyAllSessionsFor(id);

  /*
   * Any half-finished sign-in for this account is dropped too. One that was
   * started with the OLD password must not be completable with a code after
   * the password has been replaced.
   */
  await prisma.adminLoginChallenge.deleteMany({ where: { userId: id } });

  await recordAudit({
    action: 'ADMIN_TEMP_PASSWORD_RESET',
    actor: actorLabel(actor),
    target: `${admin.name} <${admin.email}>`,
    details: {
      must_change_password: true,
      sessions_revoked: true,
      from_status: admin.status,
      // Recorded so the trail is explicit about the two repairs, and about the
      // fact that the confirmation came from an administrator rather than from
      // the holder of the mailbox.
      email_confirmation: confirmingAddress ? 'administrative' : 'already_confirmed',
      promoted_from_pending: promotingFromPending,
    },
    context,
  });

  return {
    adminId: id.toString(),
    name: admin.name,
    email: admin.email,
    temporaryPassword,
    activated: promotingFromPending,
  };
}

// --- Suspension ------------------------------------------------------------

/**
 * Suspend or reactivate an Admin.
 *
 * Suspending destroys sessions and invalidates any unused access code: the
 * point of suspending is that this person should not be in the system in a
 * minute's time, and an unspent code would be a way back in.
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

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: stateFields(status) });

    if (status !== 'ACTIVE') {
      await tx.adminAccessCode.updateMany({
        where: { adminUserId: id, usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now, codeHash: '' },
      });
      await tx.adminLoginChallenge.deleteMany({ where: { userId: id } });
    }
  });

  if (status !== 'ACTIVE') await destroyAllSessionsFor(id);

  await recordAudit({
    action: status === 'ACTIVE' ? 'ADMIN_REACTIVATED' : 'ADMIN_SUSPENDED',
    actor: actorLabel(actor),
    target: `${admin.name} <${admin.email}>`,
    details: { from_status: admin.status, to_status: status },
    context,
  });

  return status;
}

/** Surfaced in the UI so the Super Admin knows whether "email it" will work. */
export function mailIsConfigured(): boolean {
  return canSendMail();
}

/** Surfaced in the UI so the security-code field can explain itself. */
export function securityCodeIsConfigured(): boolean {
  return staticCodeConfigured();
}
