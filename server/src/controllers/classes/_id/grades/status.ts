import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { gradeActionSchema } from '@/server/schemas/teaching';
import { changeGradeStatus } from '@/server/services/teaching/gradebook';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  const { action } = await parseJson(request, gradeActionSchema);
  await changeGradeStatus(user, idSchema.parse((await params).id), action, requestContext(request));
  return ok({ done: action });
});
