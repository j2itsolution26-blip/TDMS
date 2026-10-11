import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { reasonSchema } from '@/server/schemas/assessment-center';
import { cancelBatch } from '@/server/services/assessment-center/batches';

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/assessment/batches/:id/cancel — call off a batch that has no finalized result. */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.manageResults(user));
  const { reason } = await parseJson(request, reasonSchema);
  await cancelBatch(idSchema.parse((await params).id), reason, user, requestContext(request));
  return ok({ cancelled: true });
});
