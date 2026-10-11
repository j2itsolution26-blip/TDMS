import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { batchSchema } from '@/server/schemas/assessment-center';
import { createBatch } from '@/server/services/assessment-center/batches';

/** POST /api/v1/assessment/batches — open a new assessment batch. */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.manageResults(user));
  return ok(await createBatch(await parseJson(request, batchSchema), user, requestContext(request)), 201);
});
