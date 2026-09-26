import type { NextRequest } from 'next/server';
import { ok, AppError } from '@/lib/http';
import { withErrorHandling, parseJson } from '@/server/api-handler';
import { resetPasswordWithToken } from '@/server/services/account-service';
import { resetPasswordSchema } from '@/server/validation/schemas';

/**
 * POST /api/auth/reset-password
 *
 * Sets a new password against a single-use token. Also completes an
 * invitation: an account that was PENDING with a verified
 * address becomes ACTIVE once it has a password of its own.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const input = await parseJson(request, resetPasswordSchema);

  const result = await resetPasswordWithToken(input.token, input.password);
  if (!result.ok) throw new AppError(result.message, 400);

  return ok({ reset: true, next: '/login' });
});
