import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { answerKeySchema } from '@/server/schemas/teaching';
import { saveAnswerKey } from '@/server/services/teaching/assessments';

type Params = { params: Promise<{ id: string }> };

export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  const { items } = await parseJson(request, answerKeySchema);
  return ok(await saveAnswerKey(user, idSchema.parse((await params).id), items, requestContext(request)));
});
