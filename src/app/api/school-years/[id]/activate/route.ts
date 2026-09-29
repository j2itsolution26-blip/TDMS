import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/validation/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { activateSchoolYear } from '@/server/services/teaching/school-years';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageSchoolYears(user));
  return ok(await activateSchoolYear(user, idSchema.parse((await params).id), requestContext(request)));
});
