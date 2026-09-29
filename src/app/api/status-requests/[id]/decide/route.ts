import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/validation/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { decideStatusRequestSchema } from '@/server/validation/teaching';
import { decideStatusRequest } from '@/server/services/teaching/student-support';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.decideStatusRequests(user));
  const { decision, note } = await parseJson(request, decideStatusRequestSchema);
  await decideStatusRequest(user, idSchema.parse((await params).id), decision, note, requestContext(request));
  return ok({ decided: decision });
});
