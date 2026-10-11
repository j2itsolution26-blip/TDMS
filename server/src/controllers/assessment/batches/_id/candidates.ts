import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { enrolSchema } from '@/server/schemas/assessment-center';
import { enrolCandidates } from '@/server/services/assessment-center/batches';

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/assessment/batches/:id/candidates — enrol candidates; answers what was added and what was refused, and why. */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.manageResults(user));
  const { studentIds } = await parseJson(request, enrolSchema);
  return ok(await enrolCandidates(idSchema.parse((await params).id), studentIds, user, requestContext(request)));
});
