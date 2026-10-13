import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { weightsSchema } from '@/server/schemas/teaching';
import { saveWeights } from '@/server/services/teaching/gradebook';

type Params = { params: Promise<{ id: string }> };

export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  await saveWeights(user, idSchema.parse((await params).id), await parseJson(request, weightsSchema), requestContext(request));
  return ok({ saved: true });
});
