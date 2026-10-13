import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { calendarEventSchema } from '@/server/schemas/teaching';
import { deleteCalendarEvent, updateCalendarEvent } from '@/server/services/teaching/calendar';

type Params = { params: Promise<{ id: string }> };

export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageCalendar(user));
  await updateCalendarEvent(user, idSchema.parse((await params).id), await parseJson(request, calendarEventSchema), requestContext(request));
  return ok({ saved: true });
});

export const DELETE = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageCalendar(user));
  await deleteCalendarEvent(user, idSchema.parse((await params).id), requestContext(request));
  return ok({ deleted: true });
});
