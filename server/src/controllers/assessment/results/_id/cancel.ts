import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { reasonSchema } from '@/server/schemas/assessment-center';
import { cancelResult } from '@/server/services/assessment-center/batches';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.manageResults(user));
  const { reason } = await parseJson(request, reasonSchema);
  await cancelResult(idSchema.parse((await params).id), reason, user, requestContext(request));
  return ok({ cancelled: true });
});
