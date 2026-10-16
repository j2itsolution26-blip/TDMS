import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { applicationPolicy } from '@/server/auth/policies';
import { applicationSchema, idSchema } from '@/server/schemas/schemas';
import { applicationDetail, updateApplication } from '@/server/services/application-service';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(applicationPolicy.view(user));
  return ok(await applicationDetail(idSchema.parse((await params).id)));
});

export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(applicationPolicy.update(user));
  const id = idSchema.parse((await params).id);
  const input = await parseJson(request, applicationSchema);
  return ok(await updateApplication(user, id, input, requestContext(request)));
});
