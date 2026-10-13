import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { semesterSchema } from '@/server/schemas/teaching';
import { setCurrentSemester } from '@/server/services/teaching/school-years';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageSchoolYears(user));
  const { semester } = await parseJson(request, semesterSchema);
  return ok(await setCurrentSemester(user, idSchema.parse((await params).id), semester, requestContext(request)));
});
