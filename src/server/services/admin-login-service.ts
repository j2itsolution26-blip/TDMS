import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/http';
import { createSession } from '@/server/auth/session';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import {
  accessCodeMatches,
  accessCodeMaxAttempts,
  accessCodeRefusal,
  attemptsRemaining,
  isWellFormedAccessCode,
  loginChallengeExpiryFrom,
  secondsUntil,
  ACCESS_CODE_LENGTH,
} from '@/server/auth/admin-access-code';
import {
  generateChallengeHandle,
  hashChallengeHandle,
  storeChallengeHandle,
  readChallengeHandle,
  clearChallengeHandle,
} from '@/server/auth/admin-login-challenge';
import { consumeRateLimit } from '@/server/auth/rate-limit';
import { sendAccessCodeRequestEmail } from '@/server/mail/messages';
import { canSendMail } from '@/server/mail/mailer';
import { recordAudit, type AuditContext } from './audit-log';
import { ADMIN_ROLE } from './admin-account-service';

/**
 * The Admin sign-in, second step: the access code.
 *
 * This is the half of the flow that runs as the Admin, and it is separated
 * from admin-account-service.ts because the two have opposite trust
 * assumptions. That file runs as a Super Admin who is already inside; this
 * one runs for somebody who has typed a password and is, as far as the
 * application is concerned, not signed in yet.
 *
 * Which is the property to hold on to: between the password and the code
 * there is NO SESSION. What the browser holds is an opaque handle naming a
 * row in admin_login_challenges, and that row authorises exactly one thing —
 * submitting a code. Every function here is reachable without a session on
 * purpose, and none of them can be reached without the handle.
 *
 * ORDER OF CHECKS, AND WHY
 *
 *   1. the handle resolves to a live, unconsumed challenge
 *   2. rate limits, before any bcrypt work is done
 *   3. the account is STILL an active Admin — re-read, not trusted from
 *      step 1, because a Super Admin may have suspended them in between
 *   4. a live code exists
 *   5. the code matches
 *
 * Steps 3 and 4 are deliberately after the handle check: the messages they
 * produce are specific, and a specific message to somebody who has not
 * produced the handle would be an oracle.
 */

/** What the access-code screen is told. No code, no hash, no user id. */
export interface AdminVerificationState {
  /**
   * Shown so the person can see which account they are finishing. It is the
   * address they just typed a password for, so it discloses nothing they did
   * not supply.
   */
  email: string;
  /** Seconds left on the current code, or null when there is not one. */
  codeExpiresInSeconds: number | null;
  /** Guesses left against the current code. Zero when there is no code. */
  attemptsRemaining: number;
  /** Seconds before this half-finished sign-in itself lapses. */
  challengeExpiresInSeconds: number;
  /** False when mail is unconfigured, so the button can say why. */
  canRequestNewCode: boolean;
  /** Digits the input should collect. */
  codeLength: number;
}

const NO_CHALLENGE =
  'That sign-in has expired. Please enter your email address and password again.';

// --- Step 1 → step 2 -------------------------------------------------------

/**
 * Record that this browser has passed the password step, and hand it a
 * handle.
 *
 * Any earlier challenge for the same account is deleted rather than left
 * beside the new one. Two live challenges for one account would mean a
 * sign-in started on a machine somebody has walked away from is still
 * completable with a code issued for the one they are using now.
 */
export async function beginAdminVerification(
  userId: bigint,
  options: { remember: boolean; ip: string | null; userAgent: string | null },
): Promise<void> {
  const handle = generateChallengeHandle();

  await prisma.$transaction(async (tx) => {
    await tx.adminLoginChallenge.deleteMany({ where: { userId } });
    await tx.adminLoginChallenge.create({
      data: {
        userId,
        handleHash: hashChallengeHandle(handle),
        remember: options.remember,
        ipAddress: options.ip,
        userAgent: options.userAgent,
        expiresAt: loginChallengeExpiryFrom(),
      },
    });
  });

  await storeChallengeHandle(handle);
}

/** The live challenge this request carries, or null. */
async function loadChallenge() {
  const handle = await readChallengeHandle();
  if (!handle) return null;

  const row = await prisma.adminLoginChallenge.findUnique({
    where: { handleHash: hashChallengeHandle(handle) },
    select: {
      id: true,
      userId: true,
      remember: true,
      expiresAt: true,
      consumedAt: true,
    },
  });
  if (!row) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  return row;
}

/**
 * The CURRENT code for this admin — the most recently issued one, whatever
 * state it is in.
 *
 * Ordered by id rather than by createdAt. Two codes issued in the same
 * millisecond would tie on a timestamp, and "newest" would then be whichever
 * the database happened to return first; the sequence is strictly monotonic, so
 * it cannot tie.
 *
 * Deliberately "the newest" and not "the newest live one". A superseded code
 * must be measured against the current one and found wrong — which is what
 * happens, because re-issuing empties the old row's hash. Searching older rows
 * for a match would mean a cancelled code could still be recognised, and
 * recognising it is one refactor away from accepting it.
 */
async function loadCurrentCode(userId: bigint) {
  const row = await prisma.adminAccessCode.findFirst({
    where: { adminUserId: userId },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      codeHash: true,
      expiresAt: true,
      usedAt: true,
      invalidatedAt: true,
      attemptCount: true,
      maxAttempts: true,
    },
  });
  return row;
}

/**
 * Re-read the account and confirm it may still complete a sign-in.
 *
 * Not carried over from the password step. A Super Admin who suspends an
 * Admin expects that to take effect now, not at whatever point the person
 * happens to submit a code.
 */
async function loadEligibleAdmin(userId: bigint) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      emailVerifiedAt: true,
      mustChangePassword: true,
    },
  });
  if (!user) return null;
  if (user.status !== 'ACTIVE') return null;
  if (!user.emailVerifiedAt) return null;

  const roles = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, modelId: userId },
    select: { role: { select: { name: true, guardName: true } } },
  });
  const names = roles.filter((r) => r.role.guardName === GUARD).map((r) => r.role.name);
  if (!names.includes(ADMIN_ROLE)) return null;

  return user;
}

/**
 * What to draw on the verification screen, or null when there is nothing in
 * progress (which the page turns into a redirect back to /login).
 */
export async function describeAdminChallenge(): Promise<AdminVerificationState | null> {
  const challenge = await loadChallenge();
  if (!challenge) return null;

  const admin = await loadEligibleAdmin(challenge.userId);
  if (!admin) return null;

  const code = await loadCurrentCode(challenge.userId);
  const live = code && accessCodeRefusal(code) === null ? code : null;

  return {
    email: admin.email,
    codeExpiresInSeconds: live ? secondsUntil(live.expiresAt) : null,
    attemptsRemaining: live ? attemptsRemaining(live) : 0,
    challengeExpiresInSeconds: secondsUntil(challenge.expiresAt),
    canRequestNewCode: canSendMail(),
    codeLength: ACCESS_CODE_LENGTH,
  };
}

/** Abandon a half-finished sign-in — the "use a different account" path. */
export async function abandonAdminChallenge(): Promise<void> {
  const handle = await readChallengeHandle();
  if (handle) {
    await prisma.adminLoginChallenge
      .deleteMany({ where: { handleHash: hashChallengeHandle(handle) } })
      .catch(() => undefined);
  }
  await clearChallengeHandle();
}

// --- Verification ----------------------------------------------------------

/**
 * Backstops beyond the per-code attempt cap.
 *
 * The per-code budget is the real protection, but on its own it can be
 * sidestepped by an attacker who waits for each burnt code to be replaced.
 * These bound the total rate regardless of how many codes get issued.
 */
const ATTEMPT_LIMIT_PER_ACCOUNT = { max: 15, windowSeconds: 900 };
const ATTEMPT_LIMIT_PER_IP = { max: 30, windowSeconds: 900 };

export interface AccessCodeVerified {
  redirectTo: string;
}

const REFUSAL_MESSAGES: Record<NonNullable<ReturnType<typeof accessCodeRefusal>>, string> = {
  used: 'That access code has already been used. Ask the system administrator for a new one.',
  invalidated:
    'That access code has been cancelled. Ask the system administrator for a new one.',
  expired: 'That access code has expired. Ask the system administrator for a new one.',
  exhausted:
    'Too many incorrect attempts were made against that code, so it has been cancelled. Ask the system administrator for a new one.',
};

export async function verifyAdminAccessCode(
  submitted: string,
  context: AuditContext,
): Promise<AccessCodeVerified> {
  const challenge = await loadChallenge();
  if (!challenge) throw new AppError(NO_CHALLENGE, 410, undefined, 'ADMIN_LOGIN_EXPIRED');

  const ipKey = context.ip ?? 'unknown';
  const perAccount = await consumeRateLimit(
    'admin-code-attempt',
    challenge.userId.toString(),
    ATTEMPT_LIMIT_PER_ACCOUNT,
  );
  const perIp = await consumeRateLimit('admin-code-attempt-ip', ipKey, ATTEMPT_LIMIT_PER_IP);
  if (perAccount.limited || perIp.limited) {
    const wait = Math.max(perAccount.retryAfterSeconds, perIp.retryAfterSeconds);
    throw new AppError(
      `Too many attempts. Please try again in ${wait} seconds.`,
      429,
      undefined,
      'ACCESS_CODE_THROTTLED',
    );
  }

  const admin = await loadEligibleAdmin(challenge.userId);
  if (!admin) {
    /*
     * The account was suspended, stripped of its role or deleted between the
     * password and the code. The challenge is dropped so the browser is not
     * left holding a handle to something that can never complete.
     */
    await abandonAdminChallenge();
    throw new AppError(
      'This account can no longer sign in. Please contact the system administrator.',
      403,
      undefined,
      'ADMIN_NOT_ELIGIBLE',
    );
  }

  /*
   * Shape-checked before the database is touched, not to save work but
   * because a malformed submission is not an attempt against the code and
   * should not spend one of the account's guesses.
   */
  if (!isWellFormedAccessCode(submitted.trim())) {
    throw new AppError(
      `Enter the ${ACCESS_CODE_LENGTH}-digit access code.`,
      422,
      { code: [`Enter the ${ACCESS_CODE_LENGTH}-digit access code.`] },
      'ACCESS_CODE_MALFORMED',
    );
  }

  const code = await loadCurrentCode(challenge.userId);

  if (!code) {
    await recordAudit({
      action: 'ADMIN_LOGIN_FAILED',
      actor: `${admin.name} <${admin.email}>`,
      target: `${admin.name} <${admin.email}>`,
      details: { reason: 'no_access_code_issued' },
      context,
    });
    throw new AppError(
      'No access code has been issued for this account yet. Ask the system administrator for one.',
      422,
      undefined,
      'NO_ACCESS_CODE',
    );
  }

  const refusal = accessCodeRefusal(code);
  if (refusal) {
    await recordAudit({
      action: refusal === 'expired' ? 'ADMIN_ACCESS_CODE_EXPIRED' : 'ADMIN_LOGIN_FAILED',
      actor: `${admin.name} <${admin.email}>`,
      target: `${admin.name} <${admin.email}>`,
      details: { reason: refusal },
      context,
    });
    throw new AppError(REFUSAL_MESSAGES[refusal], 422, undefined, 'ACCESS_CODE_UNUSABLE');
  }

  const matched = await accessCodeMatches(submitted.trim(), code.codeHash);

  if (!matched) {
    /*
     * The attempt is counted with an atomic increment rather than a
     * read-modify-write, so parallel guesses each cost a guess. Reading the
     * count and writing count+1 would let an attacker fire five requests at
     * once and spend one attempt.
     */
    const updated = await prisma.adminAccessCode.update({
      where: { id: code.id },
      data: { attemptCount: { increment: 1 } },
      select: { attemptCount: true, maxAttempts: true },
    });

    const burnt = updated.attemptCount >= updated.maxAttempts;
    if (burnt) {
      await prisma.adminAccessCode.updateMany({
        where: { id: code.id, usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: new Date(), codeHash: '' },
      });
    }

    await recordAudit({
      action: 'ADMIN_LOGIN_FAILED',
      actor: `${admin.name} <${admin.email}>`,
      target: `${admin.name} <${admin.email}>`,
      details: {
        reason: 'incorrect_access_code',
        attempts_used: updated.attemptCount,
        code_invalidated: burnt,
      },
      context,
    });

    if (burnt) {
      throw new AppError(REFUSAL_MESSAGES.exhausted, 422, undefined, 'ACCESS_CODE_UNUSABLE');
    }

    const left = Math.max(0, updated.maxAttempts - updated.attemptCount);
    throw new AppError(
      `That access code is not correct. ${left} attempt${left === 1 ? '' : 's'} remaining.`,
      422,
      { code: ['That access code is not correct.'] },
      'ACCESS_CODE_INCORRECT',
    );
  }

  /*
   * Correct. Claiming the code and the challenge are both CONDITIONAL writes
   * whose row count is checked, which is what makes them single use under
   * concurrency: two requests carrying the same correct code both reach here,
   * and exactly one updates a row.
   */
  const now = new Date();

  const claimedCode = await prisma.adminAccessCode.updateMany({
    where: { id: code.id, usedAt: null, invalidatedAt: null },
    data: { usedAt: now },
  });
  if (claimedCode.count !== 1) {
    throw new AppError(REFUSAL_MESSAGES.used, 422, undefined, 'ACCESS_CODE_UNUSABLE');
  }

  const claimedChallenge = await prisma.adminLoginChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (claimedChallenge.count !== 1) {
    throw new AppError(NO_CHALLENGE, 410, undefined, 'ADMIN_LOGIN_EXPIRED');
  }

  await prisma.user.update({
    where: { id: admin.id },
    data: { lastLoginAt: now, updatedAt: now },
  });

  await createSession(admin.id, {
    remember: challenge.remember,
    ipAddress: context.ip ?? null,
    userAgent: context.userAgent ?? null,
  });

  await clearChallengeHandle();

  await recordAudit({
    action: 'ADMIN_ACCESS_CODE_USED',
    actor: `${admin.name} <${admin.email}>`,
    target: `${admin.name} <${admin.email}>`,
    details: { code_id: code.id.toString() },
    context,
  });

  await recordAudit({
    action: 'ADMIN_LOGIN_SUCCESS',
    actor: `${admin.name} <${admin.email}>`,
    target: `${admin.name} <${admin.email}>`,
    details: { second_factor: 'access_code', password_change_required: admin.mustChangePassword },
    context,
  });

  /*
   * A temporary password is not a password anybody should keep. The redirect
   * is a courtesy — the requirement is enforced by requireUser() and
   * requireApiUser(), so navigating elsewhere does not get past it.
   */
  return { redirectTo: admin.mustChangePassword ? '/change-password' : '/dashboard' };
}

// --- Asking for a replacement ---------------------------------------------

const REQUEST_LIMIT = { max: 3, windowSeconds: 3600 };

/**
 * Tell the Super Admins that this Admin needs a new code.
 *
 * It issues NOTHING. An account able to mint its own access code has a
 * one-factor sign-in with extra steps, so the only thing this button can do
 * is ask a human. That is also why it cannot report whether a particular
 * Super Admin exists or received it — it reports only that the request was
 * recorded.
 */
export async function requestNewAccessCode(
  context: AuditContext,
): Promise<{ notified: boolean; detail?: string }> {
  const challenge = await loadChallenge();
  if (!challenge) throw new AppError(NO_CHALLENGE, 410, undefined, 'ADMIN_LOGIN_EXPIRED');

  const admin = await loadEligibleAdmin(challenge.userId);
  if (!admin) {
    await abandonAdminChallenge();
    throw new AppError(
      'This account can no longer sign in. Please contact the system administrator.',
      403,
      undefined,
      'ADMIN_NOT_ELIGIBLE',
    );
  }

  const throttle = await consumeRateLimit(
    'admin-code-request',
    challenge.userId.toString(),
    REQUEST_LIMIT,
  );
  if (throttle.limited) {
    throw new AppError(
      'A request has already been sent. Please contact the system administrator directly.',
      429,
      undefined,
      'ACCESS_CODE_REQUEST_THROTTLED',
    );
  }

  const superAdmins = await recipientsForRequests();

  let notified = false;
  let detail: string | undefined;

  if (superAdmins.length === 0) {
    detail = 'No Super Admin account is available to notify. Please contact them directly.';
  } else if (!canSendMail()) {
    detail = 'Email is not configured on this deployment, so the request could not be sent.';
  } else {
    for (const recipient of superAdmins) {
      const result = await sendAccessCodeRequestEmail({
        to: recipient.email,
        superAdminName: recipient.name,
        adminName: admin.name,
        adminEmail: admin.email,
      });
      if (result.delivered) notified = true;
      else detail ??= result.detail;
    }
  }

  await recordAudit({
    action: 'ADMIN_ACCESS_CODE_REQUESTED',
    actor: `${admin.name} <${admin.email}>`,
    target: `${admin.name} <${admin.email}>`,
    details: { super_admins_notified: notified, recipients: superAdmins.length },
    context,
  });

  return { notified, detail };
}

/**
 * Active Super Admins, capped.
 *
 * The cap is not about load; it is so that a database which somehow holds
 * many Super Admin rows cannot be used to send a burst of mail by clicking
 * one button.
 */
async function recipientsForRequests(): Promise<{ name: string; email: string }[]> {
  const role = await prisma.role.findFirst({
    where: { name: 'super_admin', guardName: GUARD },
    select: { id: true },
  });
  if (!role) return [];

  const assignments = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, roleId: role.id },
    select: { modelId: true },
  });
  if (assignments.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: assignments.map((a) => a.modelId) }, status: 'ACTIVE' },
    orderBy: { id: 'asc' },
    take: 5,
    select: { name: true, email: true },
  });

  return users;
}

/** Housekeeping for the scheduled job in docs/deployment.md. */
export async function pruneAdminLoginArtefacts(): Promise<{ challenges: number; codes: number }> {
  const now = new Date();
  const [challenges, codes] = await Promise.all([
    prisma.adminLoginChallenge.deleteMany({ where: { expiresAt: { lte: now } } }),
    /*
     * Codes are kept for a while after they die, because "when was this code
     * used" is a question the audit trail asks of them. A week is enough for
     * that and short enough that dead hashes do not accumulate.
     */
    prisma.adminAccessCode.deleteMany({
      where: { expiresAt: { lte: new Date(now.getTime() - 7 * 24 * 3600_000) } },
    }),
  ]);
  return { challenges: challenges.count, codes: codes.count };
}

/** Exported for tests: the configured per-code guess budget. */
export { accessCodeMaxAttempts };
