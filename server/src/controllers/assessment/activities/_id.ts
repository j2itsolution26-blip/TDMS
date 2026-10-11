import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { activitySchema } from '@/server/schemas/assessment-center';
import { deleteActivity, updateActivity } from '@/server/services/assessment-center/calendar';

type Params = { params: Promise<{ id: string }> };

export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.manageCalendar(user));
  return ok(await updateActivity(idSchema.parse((await params).id), await parseJson(request, activitySchema), user, requestContext(request)));
});

export const DELETE = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.manageCalendar(user));
  await deleteActivity(idSchema.parse((await params).id), user, requestContext(request));
  return ok({ deleted: true });
});
