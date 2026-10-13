import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { assessmentActionSchema } from '@/server/schemas/teaching';
import { changeAssessmentStatus } from '@/server/services/teaching/assessments';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  const { action } = await parseJson(request, assessmentActionSchema);
  return ok(await changeAssessmentStatus(user, idSchema.parse((await params).id), action, requestContext(request)));
});
