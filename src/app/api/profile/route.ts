import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { updateProfileSchema } from '@/server/validation/schemas';
import { updateProfileInformation } from '@/server/services/profile-service';

export const PUT = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  const input = await parseJson(request, updateProfileSchema);
  await updateProfileInformation(BigInt(user.id), input);
  return ok({ updated: true });
});
