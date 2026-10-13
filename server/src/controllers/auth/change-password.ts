import { ok, AppError } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser } from '@/server/auth/current-user';
import { rotateSession } from '@/server/auth/session';
import { changeTemporaryPasswordSchema } from '@/server/schemas/schemas';
import { replaceTemporaryPassword } from '@/server/services/profile-service';
import { recordAudit } from '@/server/services/audit-log';

/**
 * POST /api/auth/change-password — replace a temporary password.
 *
 * The ONE endpoint that accepts a caller still carrying `mustChangePassword`.
 * Every other route refuses them, so an Admin cannot work through the API on a
 * credential two people know while declining to replace it.
 *
 * Whose password changes is decided by the server-side session and nothing
 * else. The body carries passwords only; there is no user id in it to trust.
 *
 * The temporary password is still required. The caller typed it minutes ago at
 * sign-in, so asking again costs almost nothing — and it means an unattended
 * browser on this screen is not a way to take over the account.
 *
 * On success every session for the account ends and this browser is issued a
 * fresh one on the same response: the holder stays signed in, and anybody else
 * who signed in with the temporary password — including whoever issued it —
 * does not.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser({ allowTemporaryPassword: true });
  const input = await parseJson(request, changeTemporaryPasswordSchema);
  const context = requestContext(request);

  let result;
  try {
    result = await replaceTemporaryPassword(BigInt(user.id), input);
  } catch (error) {
    if (error instanceof AppError) throw error;

    /*
     * Unexpected: logged in full on the server — never with the request body,
     * which holds two passwords — and answered with a sentence that says what
     * failed rather than "Something went wrong".
     */
    console.error('[AUTH] temporary password change failed', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'unknown error',
    });
    throw new AppError(
      'Unable to change password. Please try again.',
      500,
      undefined,
      'PASSWORD_CHANGE_FAILED',
    );
  }

  const sessionsEnded = await rotateSession(BigInt(user.id), {
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  /*
   * Named for who changed it. Staff accounts are issued temporary passwords too
   * (by the Admin), and a teacher's first password change logged as an "Admin"
   * event would mislead whoever reads the security log.
   */
  const isAdmin = user.roles.includes('admin') && !user.roles.includes('super_admin');

  await recordAudit({
    action: isAdmin ? 'ADMIN_TEMP_PASSWORD_CHANGED' : 'TEMP_PASSWORD_CHANGED',
    actor: `${user.name} <${user.email}>`,
    target: `${user.name} <${user.email}>`,
    // That it happened and what it ended; never a password or a hash.
    details: {
      replaced_temporary_password: true,
      temporary_credential_consumed: result.credentialConsumed,
      sessions_ended: sessionsEnded,
    },
    context,
  });

  /*
   * Only reached after the transaction has COMMITTED (replaceTemporaryPassword
   * awaits it) and the session has been rotated — so "success" here means the
   * new hash is what the sign-in endpoint will read from now on.
   */
  return ok({
    updated: true,
    message: 'Password updated successfully.',
    detail: 'Your permanent password has been set.',
    redirectTo: '/dashboard',
  });
});
