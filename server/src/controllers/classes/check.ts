import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { classCheckSchema } from '@/server/schemas/teaching';
import { checkClassSchedule } from '@/server/services/teaching/class-setup';

/**
 * POST /api/v1/classes/check — the schedule form's dry run: the room,
 * instructor and section conflicts these meetings would have. Writes
 * nothing; saving re-checks under the term lock.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  return ok(await checkClassSchedule(await parseJson(request, classCheckSchema)));
});
