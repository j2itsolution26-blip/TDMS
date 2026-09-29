import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { classSchema } from '@/server/validation/teaching';
import { createClass } from '@/server/services/teaching/class-setup';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  return ok(await createClass(user, await parseJson(request, classSchema), requestContext(request)), 201);
});
