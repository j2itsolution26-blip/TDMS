import { ok, okSecret } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import { generateAccessCodeSchema } from '@/server/schemas/schemas';
import { listAccessCodes, generateAdminAccessCode } from '@/server/services/admin-account-service';

/**
 * The Super Admin Dashboard's Admin Access Codes.
 *
 * GET lists codes with their status — never the codes themselves, which exist
 * in plaintext only in the POST response that issued them.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(adminAccountPolicy.manageAccessCodes(user));
  const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
  return ok(await listAccessCodes(Number.isFinite(page) && page > 0 ? page : 1));
});

/**
 * POST — generate a one-time code for one Admin.
 *
 * Any unspent code that Admin already had is revoked in the same transaction,
 * so only the newest works. The plaintext code is in this response and nowhere
 * else durable; only its bcrypt hash is stored.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(adminAccountPolicy.manageAccessCodes(user));
  const input = await parseJson(request, generateAccessCodeSchema);

  return okSecret(
    await generateAdminAccessCode(
      user,
      input.adminId,
      { expiresInMinutes: input.expiresInMinutes, emailAccessCode: input.emailAccessCode },
      requestContext(request),
    ),
    201,
  );
});
