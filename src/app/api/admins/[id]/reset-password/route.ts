import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import { resetAdminPasswordSchema, idSchema } from '@/server/validation/schemas';
import { resetAdminTemporaryPassword } from '@/server/services/admin-account-service';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admins/:id/reset-password — issue a fresh temporary password.
 *
 * Generated on the server, not chosen here: this exists for "they have lost
 * it", and there is no reason for the replacement to be picked by hand. Every
 * session and any half-finished sign-in for that account is dropped, because
 * the usual reason for doing this is that the old credential is in the wrong
 * hands.
 */
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  const { id } = await params;
  const targetId = idSchema.parse(id);

  authorize(
    adminAccountPolicy.resetTemporaryPassword(user, { id: targetId.toString(), roles: [] }),
  );

  const input = await parseJson(request, resetAdminPasswordSchema);

  return ok(
    await resetAdminTemporaryPassword(
      user,
      targetId,
      { securityCode: input.securityCode },
      requestContext(request),
    ),
  );
});
