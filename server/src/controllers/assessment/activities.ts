import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { activityRangeSchema, activitySchema } from '@/server/schemas/assessment-center';
import { createActivity, listActivities } from '@/server/services/assessment-center/calendar';

const DAY = 24 * 60 * 60 * 1000;

/**
 * GET /api/v1/assessment/activities?from=&to= — activities overlapping those
 * days. The bounds are padded a day each side so no time zone loses an
 * activity at the edge; the screen places each one by its own times.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.viewCalendar(user));
  const { from, to } = activityRangeSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return ok(await listActivities(new Date(Date.parse(`${from}T00:00:00Z`) - DAY), new Date(Date.parse(`${to}T00:00:00Z`) + 2 * DAY)));
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.manageCalendar(user));
  return ok(await createActivity(await parseJson(request, activitySchema), user, requestContext(request)), 201);
});
