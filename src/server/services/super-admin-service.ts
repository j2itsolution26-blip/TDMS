import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/http';
import { hashPassword } from '@/server/auth/password';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import { createSession } from '@/server/auth/session';
import { consumeRateLimit } from '@/server/auth/rate-limit';
import { canSendMail, mailConfigurationProblem } from '@/server/mail/mailer';
import { sendSuperAdminCodeEmail } from '@/server/mail/messages';
import { checkInstitutionalEmail } from '@/lib/institutional-email';
import {
  generateVerificationCode,
  hashVerificationCode,
  verificationCodeMatches,
  generateHandle,
  hashHandle,
  expiryFrom,
  isExpired,
  secondsUntil,
  attemptsRemaining,
  resendAvailableAt,
  canResend,
  MAX_RESENDS,
  MAX_VERIFICATION_ATTEMPTS,
  COMPLETION_WINDOW_MINUTES,
} from '@/server/auth/verification-code';
import { storeHandle, readHandle, clearHandle } from '@/server/auth/setup-handle';
import type { PendingRegistration } from '@/types/domain';
import { recordAudit, type AuditContext } from './audit-log';

/**
 * First-time system setup.
 *
 * A fresh installation has roles and permissions but no users at all. This is
 * the only way to obtain the first Super Admin through the web — there is no
 * seeded administrator and no default password anywhere in this codebase.
 *
 * THE ORDER OF EVENTS IS THE WHOLE POINT
 *
 *   1. the details are validated and written to `pending_admin_registrations`
 *      with the password already hashed. No `users` row. No role. No session;
 *   2. a six-digit code is generated, hashed, and emailed to the address;
 *   3. a correct code marks the pending row verified and burns the code;
 *   4. only then, and only from a verified pending row, is the account
 *      created — with its role, its email marked verified, and a session
 *      issued as the last step.
 *
 * NO SUPER ADMIN ACCOUNT IS CREATED BEFORE THE CODE HAS BEEN VERIFIED. There
 * is no path through this module that reaches `user.create` without a
 * non-null `verifiedAt` on the pending row, and the row is claimed inside the
 * same transaction that creates the account, so it cannot be spent twice.
 *
 * Every step re-checks that bootstrap is still allowed, and the final check
 * happens inside the transaction, so the one Super Admin slot cannot be won
 * by two racing requests.
 */

export const SUPER_ADMIN_ROLE = 'super_admin';

/** Where a freshly created Super Admin lands. */
const DASHBOARD = '/dashboard';

/**
 * Sending budgets, on top of the per-registration resend cap.
 *
 * These are what stop the endpoint being used to post mail to an
 * institutional mailbox, or to farm verification codes, by simply starting
 * the flow again instead of pressing Resend.
 */
const SEND_LIMIT_PER_EMAIL = { max: 6, windowSeconds: 3600 };
const SEND_LIMIT_PER_IP = { max: 10, windowSeconds: 3600 };
const VERIFY_LIMIT_PER_IP = { max: 20, windowSeconds: 900 };

export async function isBootstrapAllowed(): Promise<boolean> {
  const role = await prisma.role.findFirst({
    where: { name: SUPER_ADMIN_ROLE, guardName: GUARD },
    select: { id: true },
  });
  if (!role) return true;

  const existing = await prisma.modelHasRole.findFirst({
    where: { roleId: role.id, modelType: USER_MODEL_TYPE },
    select: { modelId: true },
  });

  return existing === null;
}

const ALREADY_BOOTSTRAPPED =
  'Super Admin setup has already been completed. Please log in using the existing administrator account.';

async function assertBootstrapAllowed(): Promise<void> {
  if (!(await isBootstrapAllowed())) throw new AppError(ALREADY_BOOTSTRAPPED, 409);
}

/**
 * Refuse before doing any work if mail cannot be delivered.
 *
 * Without this the flow would take a password, write a pending row and then
 * discover it cannot send the code — leaving the operator stuck with no way
 * forward and no explanation. The technical detail is logged; the sentence
 * shown names environment variables and never their values.
 */
/**
 * Progress logging for the registration flow.
 *
 * Development only, because in production it is noise on every request. It
 * prints the STEP reached and nothing about the data: never the address,
 * the code, the password or any hash — so turning it on cannot leak a
 * credential, and the step that is missing tells you where it stopped.
 */
function logStep(stage: string, detail: string): void {
  if (process.env.NODE_ENV === 'production') return;
  console.log(`[${stage}] ${detail}`);
}

function assertMailConfigured(): void {
  if (canSendMail()) return;

  const problem = mailConfigurationProblem()!;
  console.error('[EMAIL] x Super Admin setup blocked: no mail transport configured.');
  throw new AppError(problem, 503, undefined, 'EMAIL_SERVICE_NOT_CONFIGURED');
}

// --- What the verification screen is allowed to know ------------------------

/**
 * The shape is declared in src/types/domain.ts because the verification
 * screen renders it, and a client component may not import from here.
 */
export type PendingRegistrationState = PendingRegistration;

/**
 * Everything the screen needs, and nothing more.
 *
 * Note what is absent: the code, its hash, the password hash, the row id, the
 * handle. This shape is the entire contract with the browser.
 */
function toState(row: {
  email: string;
  verificationExpiresAt: Date;
  verificationAttempts: number;
  resendCount: number;
  lastSentAt: Date;
  verifiedAt: Date | null;
}): PendingRegistrationState {
  return {
    email: row.email,
    expiresInSeconds: secondsUntil(row.verificationExpiresAt),
    resendInSeconds: secondsUntil(resendAvailableAt(row.lastSentAt)),
    resendsRemaining: Math.max(0, MAX_RESENDS - row.resendCount),
    attemptsRemaining: attemptsRemaining(row.verificationAttempts),
    verified: row.verifiedAt !== null,
    completionInSeconds: row.verifiedAt
      ? secondsUntil(new Date(row.verifiedAt.getTime() + COMPLETION_WINDOW_MINUTES * 60_000))
      : 0,
  };
}

const NO_PENDING =
  'That registration has expired or was not found. Please enter your details again.';

/**
 * Resolve this browser's pending registration.
 *
 * A row whose code has expired AND which was never verified is deleted on
 * sight rather than merely ignored, so an abandoned attempt does not hold the
 * unique index on its email address.
 */
async function loadPending() {
  const handle = await readHandle();
  if (!handle) return null;

  const row = await prisma.pendingAdminRegistration.findUnique({
    where: { handleHash: hashHandle(handle) },
  });
  if (!row) return null;

  if (row.verifiedAt === null && isExpired(row.verificationExpiresAt)) {
    /*
     * Expiry alone does not end the registration: the operator may still ask
     * for a new code, and the resend cap is what limits that. The row is kept
     * until its resends are spent, at which point it is of no further use.
     */
    if (row.resendCount >= MAX_RESENDS) {
      await prisma.pendingAdminRegistration.deleteMany({ where: { id: row.id } });
      return null;
    }
  }

  if (row.verifiedAt !== null) {
    const deadline = new Date(row.verifiedAt.getTime() + COMPLETION_WINDOW_MINUTES * 60_000);
    if (isExpired(deadline)) {
      await prisma.pendingAdminRegistration.deleteMany({ where: { id: row.id } });
      return null;
    }
  }

  return row;
}

/** For the verification screen, on load and after a refresh. */
export async function pendingRegistrationState(): Promise<PendingRegistrationState | null> {
  const row = await loadPending();
  return row ? toState(row) : null;
}

// --- Step 1: details in, code out ------------------------------------------

export interface StartRegistrationInput {
  name: string;
  email: string;
  password: string;
}

/**
 * Validate the details, store them pending, and email a code.
 *
 * Creates no account, no role and no session. If the email cannot be sent,
 * the pending row is rolled back and the caller is told plainly — an
 * unsendable code must not leave a half-finished registration behind holding
 * the address.
 */
export async function startRegistration(
  input: StartRegistrationInput,
  context: AuditContext,
): Promise<PendingRegistrationState> {
  await assertBootstrapAllowed();
  assertMailConfigured();

  const check = checkInstitutionalEmail(input.email);
  if (!check.ok) throw new AppError(check.message!, 422, { email: [check.message!] });
  const email = check.email;

  // An address that already holds an account never gets a code.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new AppError('This email is already registered.', 422, {
      email: ['This email is already registered.'],
    });
  }

  await assertSendBudget(email, context);

  logStep('REGISTRATION', 'ok request accepted and validated');

  const code = generateVerificationCode();
  logStep('VERIFICATION', 'ok verification code generated');

  const now = new Date();
  const expiresAt = expiryFrom(now);
  const handle = generateHandle();

  /*
   * Both hashes are computed before the write, so the plaintext password and
   * the plaintext code exist only as local variables and only for as long as
   * this call takes. Neither is logged, and the code leaves this process only
   * inside the email below.
   */
  const [passwordHash, verificationCodeHash] = await Promise.all([
    hashPassword(input.password),
    hashVerificationCode(code),
  ]);

  const row = await prisma.pendingAdminRegistration.upsert({
    where: { email },
    create: {
      fullName: input.name.trim(),
      email,
      passwordHash,
      verificationCodeHash,
      verificationExpiresAt: expiresAt,
      lastSentAt: now,
      handleHash: hashHandle(handle),
    },
    /*
     * Starting again for the same address replaces the attempt outright: new
     * details, new code, new handle — which invalidates the previous
     * browser's cookie — and the counters reset. The per-address send budget
     * above is what stops that being a way around the resend cap.
     */
    update: {
      fullName: input.name.trim(),
      passwordHash,
      verificationCodeHash,
      verificationExpiresAt: expiresAt,
      verificationAttempts: 0,
      resendCount: 0,
      lastSentAt: now,
      handleHash: hashHandle(handle),
      verifiedAt: null,
    },
  });

  logStep('DATABASE', 'ok pending registration saved');
  logStep('EMAIL', '-> sending verification email');

  const mail = await sendSuperAdminCodeEmail({
    to: email,
    name: row.fullName,
    code,
    expiresAt,
  });

  if (!mail.delivered) {
    // Nothing useful was created, so leave nothing behind. The person can
    // simply try again once the cause is fixed.
    await prisma.pendingAdminRegistration.deleteMany({ where: { id: row.id } });

    /*
     * The message stays the calm, user-facing one. The `code` alongside it is
     * what makes the failure diagnosable — from the Network tab alone, with
     * no access to the server log. It names a class of problem; the host, the
     * credential and the provider's own words never leave the server.
     */
    throw new AppError(
      "We couldn't send the verification email. Please try again.",
      502,
      undefined,
      mail.code ?? 'EMAIL_PROVIDER_REJECTED',
    );
  }

  await storeHandle(handle);

  await recordAudit({
    action: 'SUPER_ADMIN_VERIFICATION_CODE_SENT',
    actor: 'SYSTEM_BOOTSTRAP',
    target: `Pending Super Admin (${email})`,
    details: { email, mail_transport: mail.transport, resend: false },
    context,
  });

  return toState(row);
}

/** IP and per-address send budgets, applied to both sending paths. */
async function assertSendBudget(email: string, context: AuditContext): Promise<void> {
  const perEmail = await consumeRateLimit('sa-send', email, SEND_LIMIT_PER_EMAIL);
  if (perEmail.limited) {
    throw new AppError(
      'Too many verification emails have been requested for that address. Please try again later.',
      429,
    );
  }

  const perIp = await consumeRateLimit('sa-send-ip', context.ip ?? 'unknown', SEND_LIMIT_PER_IP);
  if (perIp.limited) {
    throw new AppError(
      'Too many verification emails have been requested. Please try again later.',
      429,
    );
  }
}

// --- Resend ----------------------------------------------------------------

/**
 * Issue a replacement code for an existing pending registration.
 *
 * The previous code stops working the moment this succeeds, because its hash
 * is overwritten. Failed attempts reset too: a fresh code deserves a fresh
 * allowance, and the resend cap is what bounds the whole exchange.
 */
export async function resendCode(context: AuditContext): Promise<PendingRegistrationState> {
  await assertBootstrapAllowed();
  assertMailConfigured();

  const row = await loadPending();
  if (!row) throw new AppError(NO_PENDING, 410);

  if (row.verifiedAt !== null) {
    throw new AppError('That email address has already been verified.', 409);
  }

  const verdict = canResend({ resendCount: row.resendCount, lastSentAt: row.lastSentAt });
  if (!verdict.allowed) {
    if (verdict.exhausted) {
      throw new AppError(
        'No more codes can be sent for this registration. Please start again.',
        429,
      );
    }
    throw new AppError(
      `Please wait ${verdict.retryAfterSeconds} seconds before requesting another code.`,
      429,
    );
  }

  await assertSendBudget(row.email, context);

  const code = generateVerificationCode();
  const now = new Date();
  const expiresAt = expiryFrom(now);

  const updated = await prisma.pendingAdminRegistration.update({
    where: { id: row.id },
    data: {
      verificationCodeHash: await hashVerificationCode(code),
      verificationExpiresAt: expiresAt,
      verificationAttempts: 0,
      resendCount: { increment: 1 },
      lastSentAt: now,
    },
  });

  const mail = await sendSuperAdminCodeEmail({
    to: row.email,
    name: row.fullName,
    code,
    expiresAt,
  });

  if (!mail.delivered) {
    throw new AppError("We couldn't send the verification email. Please try again.", 502);
  }

  await recordAudit({
    action: 'SUPER_ADMIN_VERIFICATION_CODE_SENT',
    actor: 'SYSTEM_BOOTSTRAP',
    target: `Pending Super Admin (${row.email})`,
    details: {
      email: row.email,
      mail_transport: mail.transport,
      resend: true,
      resend_count: updated.resendCount,
    },
    context,
  });

  return toState(updated);
}

// --- Step 2: verify the code ----------------------------------------------

/**
 * Check a submitted code.
 *
 * Creates nothing. Success means the address is proven and the pending row is
 * now eligible for account creation — a separate, explicit step.
 *
 * The code is single use: on success its hash is emptied, so the same digits
 * cannot be replayed. Repeating the call from an already-verified row is
 * treated as success rather than an error, so a double-clicked button does not
 * show a failure for something that worked.
 */
export async function verifyCode(
  code: string,
  context: AuditContext,
): Promise<PendingRegistrationState> {
  await assertBootstrapAllowed();

  const perIp = await consumeRateLimit('sa-verify-ip', context.ip ?? 'unknown', VERIFY_LIMIT_PER_IP);
  if (perIp.limited) {
    throw new AppError(
      'Too many verification attempts. Please request a new code later.',
      429,
    );
  }

  const row = await loadPending();
  if (!row) throw new AppError(NO_PENDING, 410);

  // Idempotent: already verified is already the desired state.
  if (row.verifiedAt !== null) return toState(row);

  if (attemptsRemaining(row.verificationAttempts) === 0) {
    throw new AppError('Too many verification attempts. Please request a new code later.', 429);
  }

  if (isExpired(row.verificationExpiresAt)) {
    throw new AppError('This verification code has expired. Request a new code.', 410);
  }

  const matches = await verificationCodeMatches(code, row.verificationCodeHash);

  if (!matches) {
    /*
     * Count the failure first, then decide what to say. Incrementing in the
     * database rather than from the value just read means concurrent guesses
     * cannot share one attempt.
     */
    const after = await prisma.pendingAdminRegistration.update({
      where: { id: row.id },
      data: { verificationAttempts: { increment: 1 } },
      select: { verificationAttempts: true },
    });

    if (after.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
      // Burn the code outright: past the cap even the right digits are dead.
      await prisma.pendingAdminRegistration.update({
        where: { id: row.id },
        data: { verificationCodeHash: '' },
      });

      await recordAudit({
        action: 'SUPER_ADMIN_VERIFICATION_ATTEMPTS_EXCEEDED',
        actor: 'SYSTEM_BOOTSTRAP',
        target: `Pending Super Admin (${row.email})`,
        details: { email: row.email, attempts: after.verificationAttempts },
        context,
      });

      throw new AppError('Too many verification attempts. Please request a new code later.', 429);
    }

    throw new AppError('Incorrect verification code. Please try again.', 422, {
      code: ['Incorrect verification code. Please try again.'],
    });
  }

  /*
   * Conditional on still being unverified, so two simultaneous correct
   * submissions produce one verification rather than two.
   */
  const verifiedAt = new Date();
  await prisma.pendingAdminRegistration.updateMany({
    where: { id: row.id, verifiedAt: null },
    data: { verifiedAt, verificationCodeHash: '' },
  });

  const fresh = await prisma.pendingAdminRegistration.findUnique({ where: { id: row.id } });
  if (!fresh) throw new AppError(NO_PENDING, 410);

  await recordAudit({
    action: 'SUPER_ADMIN_EMAIL_VERIFIED',
    actor: 'SYSTEM_BOOTSTRAP',
    target: `Pending Super Admin (${row.email})`,
    details: { email: row.email, attempts: row.verificationAttempts },
    context,
  });

  return toState(fresh);
}

// --- Step 3: create the account -------------------------------------------

export interface CreatedSuperAdmin {
  id: string;
  email: string;
  redirectTo: string;
}

/**
 * Create the Super Admin from a verified pending registration.
 *
 * Refuses outright unless `verifiedAt` is set — this is the invariant the
 * whole flow exists to protect, and it is asserted here as well as being
 * unreachable otherwise.
 *
 * The pending row is claimed by deleting it INSIDE the transaction, with the
 * delete conditional on it still being verified and present. A second
 * concurrent request therefore deletes nothing, fails the count check, and
 * rolls back without creating a second account — which is what makes a
 * double-clicked button harmless.
 *
 * The session is issued only after the transaction has committed. An account
 * that failed to be created cannot leave an authenticated cookie behind.
 */
export async function completeRegistration(context: AuditContext): Promise<CreatedSuperAdmin> {
  await assertBootstrapAllowed();

  const row = await loadPending();
  if (!row) throw new AppError(NO_PENDING, 410);

  if (row.verifiedAt === null) {
    throw new AppError('Please verify your email address before creating the account.', 403);
  }

  const created = await prisma
    .$transaction(
      async (tx) => {
        const role = await tx.role.upsert({
          where: { name_guardName: { name: SUPER_ADMIN_ROLE, guardName: GUARD } },
          create: {
            name: SUPER_ADMIN_ROLE,
            guardName: GUARD,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          update: {},
        });

        const already = await tx.modelHasRole.findFirst({
          where: { roleId: role.id, modelType: USER_MODEL_TYPE },
          select: { modelId: true },
        });
        if (already) throw new AppError(ALREADY_BOOTSTRAPPED, 409);

        const clash = await tx.user.findUnique({
          where: { email: row.email },
          select: { id: true },
        });
        if (clash) {
          throw new AppError('This email is already registered.', 422, {
            email: ['This email is already registered.'],
          });
        }

        // Claim the verified registration. One request can win this.
        const claimed = await tx.pendingAdminRegistration.deleteMany({
          where: { id: row.id, verifiedAt: { not: null } },
        });
        if (claimed.count !== 1) {
          throw new AppError(
            'Super Admin setup is already being completed. Please wait a moment and refresh.',
            409,
          );
        }

        const user = await tx.user.create({
          data: {
            name: row.fullName,
            email: row.email,
            // Already a bcrypt hash, written at registration. Never re-hashed.
            password: row.passwordHash,
            // The code that reached this address is the proof.
            emailVerifiedAt: row.verifiedAt,
            status: 'ACTIVE',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        await tx.modelHasRole.create({
          data: { roleId: role.id, modelType: USER_MODEL_TYPE, modelId: user.id },
        });

        return user;
      },
      { isolationLevel: 'Serializable' },
    )
    .catch((error) => {
      if (error instanceof AppError) throw error;
      // A serialization failure means another request won the race.
      throw new AppError(
        'Super Admin setup is already being completed. Please wait a moment and refresh.',
        409,
      );
    });

  await clearHandle();

  await recordAudit({
    action: 'INITIAL_SUPER_ADMIN_CREATED',
    actor: 'SYSTEM_BOOTSTRAP',
    target: `Super Admin Account (${created.email})`,
    details: {
      user_id: created.id.toString(),
      name: created.name,
      email: created.email,
      role: SUPER_ADMIN_ROLE,
      email_verified: true,
    },
    context,
  });

  // The first authenticated session, created last and only now.
  await createSession(created.id, { ipAddress: context.ip, userAgent: context.userAgent });

  return { id: created.id.toString(), email: created.email, redirectTo: DASHBOARD };
}

/** Abandon the attempt — the "start over" path on the verification screen. */
export async function abandonRegistration(): Promise<void> {
  const handle = await readHandle();
  if (handle) {
    await prisma.pendingAdminRegistration.deleteMany({ where: { handleHash: hashHandle(handle) } });
  }
  await clearHandle();
}

/**
 * Housekeeping, for the scheduled job described in docs/deployment.md.
 *
 * Rows are removed once they can no longer lead anywhere: an unverified
 * registration past the point where a resend could save it, or a verified one
 * whose completion window has closed.
 */
export async function prunePendingRegistrations(): Promise<number> {
  const now = new Date();
  const completionCutoff = new Date(now.getTime() - COMPLETION_WINDOW_MINUTES * 60_000);

  const { count } = await prisma.pendingAdminRegistration.deleteMany({
    where: {
      OR: [
        { verifiedAt: null, verificationExpiresAt: { lte: now }, resendCount: { gte: MAX_RESENDS } },
        { verifiedAt: { lte: completionCutoff } },
      ],
    },
  });

  return count;
}
