import { ok } from '@/server/lib/http';
import { withErrorHandling } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { resultFilterSchema } from '@/server/schemas/assessment-center';
import { listResults } from '@/server/services/assessment-center/batches';

/** GET /api/v1/assessment/results — the monitoring view, filtered. */
export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.view(user));
  return ok(await listResults(resultFilterSchema.parse(Object.fromEntries(new URL(request.url).searchParams))));
});
