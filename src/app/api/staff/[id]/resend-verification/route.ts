import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { userPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/validation/schemas';
import { getAccount, resendVerification } from '@/server/services/account-service';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  const { id } = await params;
  const targetId = idSchema.parse(id);
  const target = await getAccount(targetId);
  authorize(userPolicy.update(user, { id: target.id.toString(), roles: target.roles }));
  return ok(await resendVerification(user, targetId, requestContext(request)));
});
