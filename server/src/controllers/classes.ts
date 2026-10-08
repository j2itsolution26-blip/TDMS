import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { classSchema } from '@/server/schemas/teaching';
import { createClass } from '@/server/services/teaching/class-setup';

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  return ok(await createClass(user, await parseJson(request, classSchema), requestContext(request)), 201);
});
