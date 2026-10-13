import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { AppError } from '@/server/lib/http';
import { dateColumnValue } from '@shared/lib/institution-time';
import { teachingPolicy } from '@/server/auth/policies';
import { archiveSchoolYearSchema } from '@/server/schemas/teaching';
import { archiveChecks, archiveSchoolYear } from '@/server/services/teaching/school-years';

type Params = { params: Promise<{ id: string }> };

/** The pre-archive checks, so the screen can show them before anyone commits. */
export const GET = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageSchoolYears(user));
  return ok(await archiveChecks(idSchema.parse((await params).id)));
});

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageSchoolYears(user));
  const input = await parseJson(request, archiveSchoolYearSchema);
  if (input.createNext && (!input.nextStartsOn || !input.nextEndsOn)) {
    throw new AppError('Set the dates of the next school year.', 422, { nextStartsOn: ['Set the dates of the next school year.'] });
  }
  const next = input.createNext ? { startsOn: dateColumnValue(input.nextStartsOn!), endsOn: dateColumnValue(input.nextEndsOn!) } : null;
  return ok(await archiveSchoolYear(user, idSchema.parse((await params).id), { acknowledge: input.acknowledge, next }, requestContext(request)));
});
