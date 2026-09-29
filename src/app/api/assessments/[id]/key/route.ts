import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/validation/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { answerKeySchema } from '@/server/validation/teaching';
import { saveAnswerKey } from '@/server/services/teaching/assessments';

type Params = { params: Promise<{ id: string }> };

export const PUT = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  const { items } = await parseJson(request, answerKeySchema);
  return ok(await saveAnswerKey(user, idSchema.parse((await params).id), items, requestContext(request)));
});
