import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { staffPdsPolicy } from '@/server/auth/policies';
import { pdsSchema } from '@/server/schemas/teaching';
import { saveOwnPds } from '@/server/services/teaching/pds';

export const PUT = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(staffPdsPolicy.keepOwn(user));
  return ok(await saveOwnPds(user, await parseJson(request, pdsSchema), requestContext(request)));
});
