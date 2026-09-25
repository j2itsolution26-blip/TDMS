import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { updatePasswordSchema } from '@/server/validation/schemas';
import { updatePassword } from '@/server/services/profile-service';

export const PUT = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  const input = await parseJson(request, updatePasswordSchema);
  await updatePassword(BigInt(user.id), input);
  return ok({ updated: true });
});
