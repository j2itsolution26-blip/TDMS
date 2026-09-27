import type { NextRequest } from 'next/server';
import { ok, okSecret } from '@/lib/http';
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
 * The response carries the temporary password in plaintext exactly once, so it
 * can be handed over; only its bcrypt hash is stored. No access code is issued
 * here — that is done from the dashboard's Admin Access Codes, as its own step.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(adminAccountPolicy.create(user));
  const input = await parseJson(request, createAdminSchema);

  const result = await createAdminAccount(
    user,
    { name: input.name, email: input.email, temporaryPassword: input.temporaryPassword },
    requestContext(request),
  );

  return okSecret(result, 201);
});
