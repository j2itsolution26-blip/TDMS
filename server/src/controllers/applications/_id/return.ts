import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { applicationPolicy } from '@/server/auth/policies';
import { returnApplicationSchema, idSchema } from '@/server/schemas/schemas';
import { returnApplication } from '@/server/services/application-service';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(applicationPolicy.review(user));
  const id = idSchema.parse((await params).id);
  const input = await parseJson(request, returnApplicationSchema);
  return ok(await returnApplication(user, id, input.reason, requestContext(request)));
});
