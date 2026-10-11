import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { reassessSchema } from '@/server/schemas/assessment-center';
import { reassess } from '@/server/services/assessment-center/batches';

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/assessment/results/:id/reassess — a new, linked attempt for a Not Yet Competent result. */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.manageResults(user));
  const { targetBatchId } = await parseJson(request, reassessSchema);
  return ok(await reassess(idSchema.parse((await params).id), targetBatchId, user, requestContext(request)), 201);
});
