import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { updatePasswordSchema } from '@/server/schemas/schemas';
import { updatePassword } from '@/server/services/profile-service';
import { rotateSession } from '@/server/auth/session';

/**
 * Change your own password. Only after the current password checks out on the
 * server is anything written; then every session for the account ends and
 * this browser gets a fresh one — so whoever else may have had the old
 * password is signed out, and the person changing it is not.
 */
export const PUT = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  const input = await parseJson(request, updatePasswordSchema);
  const context = requestContext(request);
  await updatePassword(BigInt(user.id), input, context);
  const sessionsEnded = await rotateSession(BigInt(user.id), { ipAddress: context.ip, userAgent: context.userAgent });
  return ok({ updated: true, otherSessionsEnded: Math.max(0, sessionsEnded - 1) });
});
