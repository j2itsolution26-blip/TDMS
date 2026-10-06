import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/http';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { destroyAllSessionsFor, destroyCurrentSession } from '@/server/auth/session';
import { checkRateLimit, consumeRateLimit, clearRateLimit } from '@/server/auth/rate-limit';
import { consumeTemporaryCredential } from './admin-account-service';

/** Port of the three profile/* Volt components. */

export async function updateProfileInformation(userId: bigint, input: { name: string; email: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new AppError('Account not found.', 404);

  // Laravel rule: lowercase|email|unique ignoring self.
  const email = input.email.toLowerCase();

  const clash = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, id: { not: userId } },
    select: { id: true },
  });
  if (clash) throw new AppError('That email address is already in use.', 422, { email: ['That email address is already in use.'] });

  // isDirty('email') -> re-verification is required after a change.
  const emailChanged = user.email.toLowerCase() !== email;

  return prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      email,
      ...(emailChanged ? { emailVerifiedAt: null } : {}),
      updatedAt: new Date(),
    },
  });
}

/**
 * Laravel's `current_password` rule, then Password::defaults().
 *
 * Changing a password invalidates every OTHER session for the account —
 * the usual reason to change one is that you suspect somebody else has it.
 * The caller's own session survives, so they are not signed out of the tab
 * they are using.
 */
export async function updatePassword(
  userId: bigint,
  input: { currentPassword: string; password: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user) throw new AppError('Account not found.', 404);

  const currentValid = await verifyPassword(input.currentPassword, user.password);
  if (!currentValid) {
    throw new AppError('The provided password is incorrect.', 422, {
      currentPassword: ['The provided password is incorrect.'],
    });
  }

  /*
   * Clearing mustChangePassword here — rather than only on a dedicated
   * "finish setup" endpoint — is what makes the forced change a single rule
   * with a single exit. Whichever screen an Admin uses to replace a
   * Super Admin-issued temporary password, replacing it is what ends the
   * requirement. The flag is already false for everybody else, so setting it
   * false unconditionally changes nothing for them.
   */
  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: await hashPassword(input.password),
      mustChangePassword: false,
      passwordChangedAt: now,
      updatedAt: now,
    },
  });

  /*
   * The temporary password is gone, so its revealable copy goes with it: the
   * ciphertext is destroyed and the Super Admin can no longer show anything.
   * The new password is the user's own and is never stored recoverably.
   */
  await consumeTemporaryCredential(userId);
}

// --- Replacing a temporary password ----------------------------------------

export const TEMPORARY_PASSWORD_MESSAGES = {
  incorrect: 'Incorrect temporary password.',
  verified: 'Temporary password verified.',
  superseded:
    'Your temporary password was reset by the system administrator while you were here, so your password was NOT changed. Sign in again with the new temporary password.',
  suspended: 'Your account is suspended. Please contact the system administrator.',
  inactive: 'Your account is not active. Please contact the system administrator.',
  alreadyChanged: 'Your password has already been changed. Continue to your dashboard.',
  sameAsTemporary: 'Choose a new password that is different from your temporary password.',
  throttled: 'Too many incorrect attempts. Please wait a few minutes and try again.',
} as const;

/** Wrong guesses at the temporary password when SUBMITTING, per account. */
const WRONG_TEMPORARY_PASSWORD_LIMIT = { max: 5, windowSeconds: 900 };

/**
 * The live "is this the right temporary password?" check has its own, looser
 * budget. It answers as the person types, so an honest typo costs a check —
 * sharing the submit budget would lock somebody out for mistyping twice while
 * the field was still being corrected. It is still bounded, so it is not an
 * unlimited oracle; and it is only reachable from a session that was itself
 * opened with this temporary password plus an access code.
 */
const TEMPORARY_PASSWORD_CHECK_LIMIT = { max: 20, windowSeconds: 900 };

export interface TemporaryPasswordReplaced {
  /** Whether a revealable copy of the temporary password existed and was destroyed. */
  credentialConsumed: boolean;
}

/**
 * Replace a Super Admin-issued temporary password with the holder's own.
 *
 * Separate from updatePassword() above — which the profile page uses — because
 * this one has to be stricter about state and it has to be atomic:
 *
 *   * it only runs while `mustChangePassword` is set. Afterwards there is no
 *     temporary password left to replace, and a repeat (a double click, a
 *     second tab, a refresh) is told so rather than silently changing the
 *     password again;
 *   * the account must still be ACTIVE — re-read here, not trusted from the
 *     session lookup, because a Super Admin can suspend it at any moment;
 *   * the password and the temporary-credential record change in ONE
 *     transaction, and the user row is updated conditionally on
 *     `mustChangePassword` still being true, so two concurrent requests
 *     produce exactly one change and nothing is ever half-applied.
 *
 * The user id comes from the server-side session, never from the request.
 */
export async function replaceTemporaryPassword(
  userId: bigint,
  input: { currentPassword: string; password: string },
): Promise<TemporaryPasswordReplaced> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, status: true, mustChangePassword: true },
  });
  if (!user) throw new AppError('Account not found.', 404, undefined, 'ACCOUNT_NOT_FOUND');

  if (user.status === 'SUSPENDED') {
    throw new AppError(TEMPORARY_PASSWORD_MESSAGES.suspended, 403, undefined, 'ACCOUNT_SUSPENDED');
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError(TEMPORARY_PASSWORD_MESSAGES.inactive, 403, undefined, 'ACCOUNT_NOT_ACTIVE');
  }

  if (!user.mustChangePassword) {
    throw new AppError(
      TEMPORARY_PASSWORD_MESSAGES.alreadyChanged,
      409,
      undefined,
      'TEMP_PASSWORD_ALREADY_CHANGED',
    );
  }

  /*
   * Checked before the password comparison so a caller who is already over
   * budget learns nothing more from further guesses. Only WRONG answers are
   * counted (below), so a legitimate user is never throttled by succeeding.
   */
  const budget = await checkRateLimit('temp-password-wrong', userId.toString(), WRONG_TEMPORARY_PASSWORD_LIMIT);
  if (budget.limited) {
    throw new AppError(TEMPORARY_PASSWORD_MESSAGES.throttled, 429, undefined, 'TEMP_PASSWORD_THROTTLED');
  }

  // The stored-hash comparison — never a plaintext comparison.
  if (!(await verifyPassword(input.currentPassword, user.password))) {
    await consumeRateLimit('temp-password-wrong', userId.toString(), WRONG_TEMPORARY_PASSWORD_LIMIT);
    throw new AppError(
      TEMPORARY_PASSWORD_MESSAGES.incorrect,
      422,
      { currentPassword: [TEMPORARY_PASSWORD_MESSAGES.incorrect] },
      'TEMP_PASSWORD_INCORRECT',
    );
  }

  /*
   * A password two people knew must not survive by being chosen again. The
   * comparison is against the stored hash, so this costs one hash verification and
   * stores nothing new.
   */
  if (await verifyPassword(input.password, user.password)) {
    throw new AppError(
      TEMPORARY_PASSWORD_MESSAGES.sameAsTemporary,
      422,
      { password: [TEMPORARY_PASSWORD_MESSAGES.sameAsTemporary] },
      'PASSWORD_UNCHANGED',
    );
  }

  // Hashed before the transaction: Argon2id is slow and a transaction should not be.
  const newHash = await hashPassword(input.password);
  const now = new Date();

  const credentialConsumed = await prisma.$transaction(async (tx) => {
    /*
     * Compare-and-swap on the EXACT hash the temporary password was verified
     * against, not merely on the flag. A Super Admin reset issues a fresh
     * temporary password and leaves the flag set — so a flag-only condition
     * would let a request that verified the OLD temporary password overwrite
     * the NEW one, silently throwing away the credential the administrator
     * had just issued. Matching on the hash makes a reset in the middle of a
     * change a clean refusal instead.
     */
    const changed = await tx.user.updateMany({
      where: { id: userId, mustChangePassword: true, status: 'ACTIVE', password: user.password },
      data: {
        password: newHash,
        mustChangePassword: false,
        passwordChangedAt: now,
        updatedAt: now,
      },
    });

    /*
     * Zero rows: another request finished first, the account was suspended,
     * or the temporary password was reset underneath us. Throwing rolls the
     * transaction back, so the credential below is not touched either; which
     * of the three it was is worked out after the rollback.
     */
    if (changed.count !== 1) throw new ChangeLost();

    // The revealable copy is destroyed with it: the Super Admin can no longer show anything.
    const consumed = await tx.temporaryCredential.updateMany({
      where: { userId, usedAt: null, revokedAt: null },
      data: { usedAt: now, sealed: '' },
    });

    return consumed.count > 0;
  }).catch(async (error) => {
    if (!(error instanceof ChangeLost)) throw error;
    throw await explainLostChange(userId);
  });

  await clearRateLimit('temp-password-wrong', userId.toString());

  return { credentialConsumed };
}

/** Internal signal: the conditional write matched no row. */
class ChangeLost extends Error {}

/**
 * Say accurately why a change that passed every check did not land.
 *
 * Read after the rollback, so it describes the account as it now is. The
 * order matters: "already changed" wins, because a second tab finishing first
 * means the user is done and should simply move on.
 */
async function explainLostChange(userId: bigint): Promise<AppError> {
  const now = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, mustChangePassword: true },
  });

  if (!now || !now.mustChangePassword) {
    return new AppError(
      TEMPORARY_PASSWORD_MESSAGES.alreadyChanged,
      409,
      undefined,
      'TEMP_PASSWORD_ALREADY_CHANGED',
    );
  }
  if (now.status === 'SUSPENDED') {
    return new AppError(TEMPORARY_PASSWORD_MESSAGES.suspended, 403, undefined, 'ACCOUNT_SUSPENDED');
  }
  if (now.status !== 'ACTIVE') {
    return new AppError(TEMPORARY_PASSWORD_MESSAGES.inactive, 403, undefined, 'ACCOUNT_NOT_ACTIVE');
  }
  return new AppError(TEMPORARY_PASSWORD_MESSAGES.superseded, 409, undefined, 'TEMP_PASSWORD_SUPERSEDED');
}

/**
 * The live check behind "Temporary password verified." on the setup screen.
 *
 * Answers one question — does this match the password the account holds right
 * now? — and only while that password IS a temporary one. It never changes
 * anything. Once `mustChangePassword` is clear there is no temporary password
 * to check, and saying "incorrect" would be misleading, so it says so instead.
 */
export async function checkTemporaryPassword(
  userId: bigint,
  candidate: string,
): Promise<{ valid: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, status: true, mustChangePassword: true },
  });
  if (!user) throw new AppError('Account not found.', 404, undefined, 'ACCOUNT_NOT_FOUND');
  if (user.status === 'SUSPENDED') {
    throw new AppError(TEMPORARY_PASSWORD_MESSAGES.suspended, 403, undefined, 'ACCOUNT_SUSPENDED');
  }
  if (!user.mustChangePassword) {
    throw new AppError(
      TEMPORARY_PASSWORD_MESSAGES.alreadyChanged,
      409,
      undefined,
      'TEMP_PASSWORD_ALREADY_CHANGED',
    );
  }

  const budget = await consumeRateLimit(
    'temp-password-check',
    userId.toString(),
    TEMPORARY_PASSWORD_CHECK_LIMIT,
  );
  if (budget.limited) {
    throw new AppError(TEMPORARY_PASSWORD_MESSAGES.throttled, 429, undefined, 'TEMP_PASSWORD_THROTTLED');
  }

  return { valid: await verifyPassword(candidate, user.password) };
}

/** Port of delete-user-form: confirm with the current password, then delete. */
export async function deleteOwnAccount(userId: bigint, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user) throw new AppError('Account not found.', 404);

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    throw new AppError('The provided password is incorrect.', 422, {
      password: ['The provided password is incorrect.'],
    });
  }

  await destroyAllSessionsFor(userId);
  await destroyCurrentSession();
  await prisma.user.delete({ where: { id: userId } });
}
