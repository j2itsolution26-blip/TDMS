import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import { createAdminSchema } from '@/server/validation/schemas';
import { listAdminAccounts, createAdminAccount } from '@/server/services/admin-account-service';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(adminAccountPolicy.viewAny(user));
  const page = Number(request.nextUrl.searchParams.get('page') ?? 1);
  return ok(await listAdminAccounts(Number.isFinite(page) && page > 0 ? page : 1));
});

/**
 * POST /api/admins — create an administrator account.
 *
 * The response is the ONLY time the temporary password and the first access
 * code exist outside the Super Admin's screen. Both are returned in plaintext
 * here by design, because they have to be handed over; only their bcrypt
 * hashes are stored, and neither can be retrieved again afterwards.
 *
 * 201, and deliberately not cached anywhere: the route is dynamic, the
 * response has no cache headers that would let it be replayed, and the client
 * shows it once without persisting it.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(adminAccountPolicy.create(user));
  const input = await parseJson(request, createAdminSchema);

  const result = await createAdminAccount(
    user,
    {
      name: input.name,
      email: input.email,
      temporaryPassword: input.temporaryPassword,
      securityCode: input.securityCode,
      emailAccessCode: input.emailAccessCode,
    },
    requestContext(request),
  );

  return ok(result, 201);
});
