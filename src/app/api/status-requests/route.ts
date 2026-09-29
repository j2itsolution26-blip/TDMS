import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { statusRequestSchema } from '@/server/validation/teaching';
import { createStatusRequest } from '@/server/services/teaching/student-support';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  return ok(await createStatusRequest(user, await parseJson(request, statusRequestSchema), requestContext(request)), 201);
});
