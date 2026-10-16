import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { applicationPolicy } from '@/server/auth/policies';
import { applicationDocumentStatusSchema, idSchema } from '@/server/schemas/schemas';
import { setApplicationDocumentStatus } from '@/server/services/application-service';

type Params = { params: Promise<{ id: string; requirementId: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(applicationPolicy.manageDocuments(user));
  const { id, requirementId } = await params;
  const input = await parseJson(request, applicationDocumentStatusSchema);
  return ok(await setApplicationDocumentStatus(user, idSchema.parse(id), idSchema.parse(requirementId), input, requestContext(request)));
});
