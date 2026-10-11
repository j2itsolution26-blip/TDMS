import { ok } from '@/server/lib/http';
import { withErrorHandling, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { finalizeBatch } from '@/server/services/assessment-center/batches';

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/assessment/batches/:id/finalize — make every recorded result official and lock the batch. */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.manageResults(user));
  return ok(await finalizeBatch(idSchema.parse((await params).id), user, requestContext(request)));
});
