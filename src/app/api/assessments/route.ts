import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { assessmentSchema } from '@/server/validation/teaching';
import { createAssessment } from '@/server/services/teaching/assessments';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  return ok(await createAssessment(user, await parseJson(request, assessmentSchema), requestContext(request)), 201);
});
