import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { userPolicy } from '@/server/auth/policies';
import { accountStatusChangeSchema, idSchema } from '@/server/validation/schemas';
import { getAccount, setAccountStatus } from '@/server/services/account-service';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/staff/:id/status — activate, deactivate or suspend.
 *
 * Replaces the old toggle: with four explicit states a boolean flip is no
 * longer expressive enough, and "deactivate" and "suspend" are different
 * administrative decisions that the audit trail should tell apart.
 */
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  const { id } = await params;
  const targetId = idSchema.parse(id);
  const target = await getAccount(targetId);
  authorize(userPolicy.toggleActive(user, { id: target.id.toString(), roles: target.roles }));
  const { status } = await parseJson(request, accountStatusChangeSchema);
  return ok({ status: await setAccountStatus(user, targetId, status, requestContext(request)) });
});
