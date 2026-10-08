import { ok, okSecret } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { userPolicy } from '@/server/auth/policies';
import { createStaffSchema } from '@/server/schemas/schemas';
import { listAccounts, createStaffAccount } from '@/server/services/account-service';

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(userPolicy.viewAny(user));
  const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
  return ok(await listAccounts(Number.isFinite(page) && page > 0 ? page : 1));
});

/**
 * Create a staff account directly — ACTIVE, with a temporary password the
 * holder must replace at first sign-in. No invitation email is involved.
 *
 * The response carries the temporary password once, `no-store`; only its
 * password hash is kept.
 */
export const POST = withErrorHandling(async (request: Request) => {
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
