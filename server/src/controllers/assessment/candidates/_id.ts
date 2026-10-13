import { ok } from '@/server/lib/http';
import { withErrorHandling } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { candidateHistory } from '@/server/services/assessment-center/batches';

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/assessment/candidates/:id — every attempt a candidate has had. */
export const GET = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.view(user));
  return ok(await candidateHistory(idSchema.parse((await params).id)));
});
