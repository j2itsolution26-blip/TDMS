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
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: await hashPassword(input.password),
      mustChangePassword: false,
      updatedAt: new Date(),
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
  incorrect: 'Temporary password is incorrect.',
  suspended: 'Your account is suspended. Please contact the system administrator.',
  inactive: 'Your account is not active. Please contact the system administrator.',
  alreadyChanged: 'Your password has already been changed. Continue to your dashboard.',
  sameAsTemporary: 'Choose a new password that is different from your temporary password.',
  throttled: 'Too many incorrect attempts. Please wait a few minutes and try again.',
} as const;

/** Wrong guesses at the temporary password, per account. */
const WRONG_TEMPORARY_PASSWORD_LIMIT = { max: 5, windowSeconds: 900 };

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

  // The existing bcrypt comparison — never a plaintext comparison.
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
   * comparison is against the stored hash, so this costs one bcrypt round and
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

  // Hashed before the transaction: bcrypt is slow and a transaction should not be.
  const newHash = await hashPassword(input.password);
  const now = new Date();

  const credentialConsumed = await prisma.$transaction(async (tx) => {
    const changed = await tx.user.updateMany({
      where: { id: userId, mustChangePassword: true, status: 'ACTIVE' },
      data: { password: newHash, mustChangePassword: false, updatedAt: now },
    });

    /*
     * Zero rows means another request finished first, or the account was
     * suspended in the last few milliseconds. Throwing rolls the transaction
     * back, so the credential below is not touched either.
     */
    if (changed.count !== 1) {
      throw new AppError(
        TEMPORARY_PASSWORD_MESSAGES.alreadyChanged,
        409,
        undefined,
        'TEMP_PASSWORD_ALREADY_CHANGED',
      );
    }

    // The revealable copy is destroyed with it: the Super Admin can no longer show anything.
    const consumed = await tx.temporaryCredential.updateMany({
      where: { userId, usedAt: null, revokedAt: null },
      data: { usedAt: now, sealed: '' },
    });

    return consumed.count > 0;
  });

  await clearRateLimit('temp-password-wrong', userId.toString());

  return { credentialConsumed };
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
