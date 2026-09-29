import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { calendarEventSchema, dayKey } from '@/server/validation/teaching';
import { calendarEntries, createCalendarEvent } from '@/server/services/teaching/calendar';

/** Everyone signed in may read the calendar. */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  const from = dayKey.parse(request.nextUrl.searchParams.get('from'));
  const to = dayKey.parse(request.nextUrl.searchParams.get('to'));
  return ok(await calendarEntries(user, from, to));
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageCalendar(user));
  return ok(await createCalendarEvent(user, await parseJson(request, calendarEventSchema), requestContext(request)), 201);
});
