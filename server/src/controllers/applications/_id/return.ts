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
  const { id } = await params;
  const input = await parseJson(request, returnApplicationSchema);
  await returnApplication(idSchema.parse(id), input.reason, BigInt(user.id));
  return ok({ status: 'returned' });
});
