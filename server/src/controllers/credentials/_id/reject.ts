import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { studentCredentialPolicy } from '@/server/auth/policies';
import { rejectCredentialSchema, idSchema } from '@/server/schemas/schemas';
import { rejectCredential } from '@/server/services/enrollment-service';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(studentCredentialPolicy.verify(user));
  const { id } = await params;
  const input = await parseJson(request, rejectCredentialSchema);
  await rejectCredential(idSchema.parse(id), BigInt(user.id), input.reason);
  return ok({ status: 'rejected' });
});
