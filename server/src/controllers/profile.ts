import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { updateProfileSchema } from '@/server/schemas/schemas';
import { updateProfileInformation } from '@/server/services/profile-service';

export const PUT = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  const input = await parseJson(request, updateProfileSchema);
  const updated = await updateProfileInformation(BigInt(user.id), input, requestContext(request));
  return ok({ updated: true, name: updated.name });
});
