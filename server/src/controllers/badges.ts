import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { badgeSchema } from '@/server/schemas/teaching';
import { awardBadge } from '@/server/services/teaching/student-support';

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  return ok(await awardBadge(user, await parseJson(request, badgeSchema), requestContext(request)), 201);
});
