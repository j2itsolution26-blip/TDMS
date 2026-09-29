import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/validation/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { assessmentActionSchema } from '@/server/validation/teaching';
import { changeAssessmentStatus } from '@/server/services/teaching/assessments';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  const { action } = await parseJson(request, assessmentActionSchema);
  return ok(await changeAssessmentStatus(user, idSchema.parse((await params).id), action, requestContext(request)));
});
