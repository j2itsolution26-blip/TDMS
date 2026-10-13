import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { calendarEventSchema, dayKey } from '@/server/schemas/teaching';
import { calendarEntries, createCalendarEvent } from '@/server/services/teaching/calendar';

/** Everyone signed in may read the calendar. */
export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  const from = dayKey.parse(new URL(request.url).searchParams.get('from'));
  const to = dayKey.parse(new URL(request.url).searchParams.get('to'));
  return ok(await calendarEntries(user, from, to));
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageCalendar(user));
  return ok(await createCalendarEvent(user, await parseJson(request, calendarEventSchema), requestContext(request)), 201);
});
