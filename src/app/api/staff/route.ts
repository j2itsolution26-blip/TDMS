import type { NextRequest } from 'next/server';
import { ok, okSecret } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { userPolicy } from '@/server/auth/policies';
import { createStaffSchema } from '@/server/validation/schemas';
import { listAccounts, createStaffAccount } from '@/server/services/account-service';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(userPolicy.viewAny(user));
  const page = Number(request.nextUrl.searchParams.get('page') ?? 1);
  return ok(await listAccounts(Number.isFinite(page) && page > 0 ? page : 1));
});

/**
 * Create a staff account directly — ACTIVE, with a temporary password the
 * holder must replace at first sign-in. No invitation email is involved.
 *
 * The response carries the temporary password once, `no-store`; only its
 * bcrypt hash is kept.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(userPolicy.create(user));
  const input = await parseJson(request, createStaffSchema);
  return okSecret(
    await createStaffAccount(
      user,
      {
        name: input.name,
        email: input.email,
        role: input.role,
        temporaryPassword: input.temporaryPassword,
      },
      requestContext(request),
    ),
    201,
  );
});
