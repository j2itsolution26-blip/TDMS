import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { assessmentSchema } from '@/server/schemas/teaching';
import { createAssessment } from '@/server/services/teaching/assessments';

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  return ok(await createAssessment(user, await parseJson(request, assessmentSchema), requestContext(request)), 201);
});
