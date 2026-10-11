import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { batchSchema } from '@/server/schemas/assessment-center';
import { getBatch, updateBatch } from '@/server/services/assessment-center/batches';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.view(user));
  return ok(await getBatch(idSchema.parse((await params).id)));
});

export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.manageResults(user));
  return ok(await updateBatch(idSchema.parse((await params).id), await parseJson(request, batchSchema), user, requestContext(request)));
});
