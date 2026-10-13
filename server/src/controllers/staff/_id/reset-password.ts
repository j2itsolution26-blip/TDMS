import { okSecret } from '@/server/lib/http';
import { withErrorHandling, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { userPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { getAccount, resetStaffTemporaryPassword } from '@/server/services/account-service';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/staff/:id/reset-password — issue a fresh temporary password.
 *
 * Generated on the server and returned once (`no-store`). Every session for the
 * account ends, and the holder must choose their own password at the next
 * sign-in. No email is involved.
 */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  const { id } = await params;
  const targetId = idSchema.parse(id);
  const target = await getAccount(targetId);
  authorize(userPolicy.resetPassword(user, { id: target.id.toString(), roles: target.roles }));
  return okSecret(await resetStaffTemporaryPassword(user, targetId, requestContext(request)));
});
