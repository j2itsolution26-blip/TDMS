import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { schoolYearSchema } from '@/server/schemas/teaching';
import { dateColumnValue } from '@shared/lib/institution-time';
import { createSchoolYear, listSchoolYears } from '@/server/services/teaching/school-years';

export const GET = withErrorHandling(async () => {
  const user = await requireApiUser();
  authorize(teachingPolicy.viewSchoolYears(user));
  return ok(await listSchoolYears());
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageSchoolYears(user));
  const input = await parseJson(request, schoolYearSchema);
  return ok(
    await createSchoolYear(user, { label: input.label, startsOn: dateColumnValue(input.startsOn), endsOn: dateColumnValue(input.endsOn) }, requestContext(request)),
    201,
  );
});
