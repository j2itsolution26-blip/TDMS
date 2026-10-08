import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { assessmentSchema } from '@/server/schemas/teaching';
import { assessmentDetail, deleteAssessment, updateAssessment } from '@/server/services/teaching/assessments';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  return ok(await assessmentDetail(user, idSchema.parse((await params).id)));
});

export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  return ok(await updateAssessment(user, idSchema.parse((await params).id), await parseJson(request, assessmentSchema), requestContext(request)));
});

export const DELETE = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  await deleteAssessment(user, idSchema.parse((await params).id), requestContext(request));
  return ok({ deleted: true });
});
