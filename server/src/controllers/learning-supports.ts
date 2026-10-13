import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { learningSupportSchema } from '@/server/schemas/teaching';
import { createLearningSupport } from '@/server/services/teaching/student-support';

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  return ok(await createLearningSupport(user, await parseJson(request, learningSupportSchema), requestContext(request)), 201);
});
