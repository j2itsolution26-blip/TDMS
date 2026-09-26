import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { userPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/validation/schemas';
import { getAccount, sendAdminPasswordReset } from '@/server/services/account-service';

type Params = { params: Promise<{ id: string }> };

/**
 * Sends a reset link to the account's verified institutional address. The
 * administrator never learns the new password, which is the point — the old
 * flow displayed a generated one on screen.
 */
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  const { id } = await params;
  const targetId = idSchema.parse(id);
  const target = await getAccount(targetId);
  authorize(userPolicy.resetPassword(user, { id: target.id.toString(), roles: target.roles }));
  return ok(await sendAdminPasswordReset(user, targetId, requestContext(request)));
});
