import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { sectionSchema } from '@/server/schemas/teaching';
import { createSection } from '@/server/services/teaching/class-setup';

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  return ok(await createSection(user, await parseJson(request, sectionSchema), requestContext(request)), 201);
});
