import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { learningSupportUpdateSchema } from '@/server/schemas/teaching';
import { updateLearningSupport } from '@/server/services/teaching/student-support';

type Params = { params: Promise<{ id: string }> };

export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  await updateLearningSupport(user, idSchema.parse((await params).id), await parseJson(request, learningSupportUpdateSchema), requestContext(request));
  return ok({ saved: true });
});
