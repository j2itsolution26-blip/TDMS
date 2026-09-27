import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/validation/schemas';
import { resetAdminTemporaryPassword } from '@/server/services/admin-account-service';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admins/:id/reset-password — issue a fresh temporary password.
 *
 * No body and no security code: the signed-in Super Admin is the authority.
 * The password is generated on the server and returned once. Every session,
 * any half-finished sign-in and any unspent access code for that Admin are
 * ended with it.
 */
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  const { id } = await params;
  const targetId = idSchema.parse(id);

  authorize(
    adminAccountPolicy.resetTemporaryPassword(user, { id: targetId.toString(), roles: [] }),
  );

  return ok(await resetAdminTemporaryPassword(user, targetId, requestContext(request)));
});
