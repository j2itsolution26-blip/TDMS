import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { studentCredentialPolicy } from '@/server/auth/policies';
import { verifyCredentialSchema, idSchema } from '@/server/schemas/schemas';
import { verifyCredential } from '@/server/services/enrollment-service';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(studentCredentialPolicy.verify(user));
  const { id } = await params;
  const input = await parseJson(request, verifyCredentialSchema);
  return ok(await verifyCredential(user, idSchema.parse(id), input, requestContext(request)));
});
