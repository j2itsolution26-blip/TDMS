import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { openSessionSchema } from '@/server/schemas/teaching';
import { openSession } from '@/server/services/teaching/attendance';

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  return ok(await openSession(user, await parseJson(request, openSessionSchema), requestContext(request)), 201);
});
