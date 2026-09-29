import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { pdsSchema } from '@/server/validation/teaching';
import { saveOwnPds } from '@/server/services/teaching/pds';

export const PUT = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  return ok(await saveOwnPds(user, await parseJson(request, pdsSchema), requestContext(request)));
});
