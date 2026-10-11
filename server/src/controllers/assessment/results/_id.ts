import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { recordResultSchema } from '@/server/schemas/assessment-center';
import { recordResult } from '@/server/services/assessment-center/batches';

type Params = { params: Promise<{ id: string }> };

/** PUT /api/v1/assessment/results/:id — record or correct a result while it is still a draft. */
export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.manageResults(user));
  const { result, remarks } = await parseJson(request, recordResultSchema);
  await recordResult(idSchema.parse((await params).id), result, remarks, user, requestContext(request));
  return ok({ saved: true });
});
