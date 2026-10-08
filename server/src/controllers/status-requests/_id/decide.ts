import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { decideStatusRequestSchema } from '@/server/schemas/teaching';
import { decideStatusRequest } from '@/server/services/teaching/student-support';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.decideStatusRequests(user));
  const { decision, note } = await parseJson(request, decideStatusRequestSchema);
  await decideStatusRequest(user, idSchema.parse((await params).id), decision, note, requestContext(request));
  return ok({ decided: decision });
});
