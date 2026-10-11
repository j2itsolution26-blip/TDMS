import { ok } from '@/server/lib/http';
import { withErrorHandling } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { searchCandidates } from '@/server/services/assessment-center/options';

/** GET /api/v1/assessment/candidates?programId=&q= — students who may be enrolled into a batch. */
export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.manageResults(user));
  const params = new URL(request.url).searchParams;
  const programId = idSchema.parse(params.get('programId'));
  return ok(await searchCandidates(programId, (params.get('q') ?? '').trim().slice(0, 100)));
});
