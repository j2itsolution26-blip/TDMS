import { ok } from '@/server/lib/http';
import { withErrorHandling } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { assessorOptions, qualificationOptions, staffOptions } from '@/server/services/assessment-center/options';
import { batchOptions } from '@/server/services/assessment-center/batches';

/** GET /api/v1/assessment/options — choices for the Assessment Center forms and filters. */
export const GET = withErrorHandling(async () => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.viewCalendar(user));
  const [assessors, staff, qualifications, batches] = await Promise.all([assessorOptions(), staffOptions(), qualificationOptions(), batchOptions()]);
  return ok({ assessors, staff, qualifications, batches });
});
