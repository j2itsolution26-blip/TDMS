import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/validation/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { learningSupportUpdateSchema } from '@/server/validation/teaching';
import { updateLearningSupport } from '@/server/services/teaching/student-support';

type Params = { params: Promise<{ id: string }> };

export const PUT = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  await updateLearningSupport(user, idSchema.parse((await params).id), await parseJson(request, learningSupportUpdateSchema), requestContext(request));
  return ok({ saved: true });
});
