import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/http';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { destroyAllSessionsFor, destroyCurrentSession } from '@/server/auth/session';

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

  await prisma.user.update({
    where: { id: userId },
    data: { password: await hashPassword(input.password), updatedAt: new Date() },
  });
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
