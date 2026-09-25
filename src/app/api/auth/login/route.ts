import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, clientIp } from '@/server/api-handler';
import { loginSchema } from '@/server/validation/schemas';
import { login } from '@/server/services/auth-service';

/**
 * POST /api/auth/login
 *
 * Replaces the Livewire `login()` action. Validation, lookup, bcrypt
 * verification, status check, session creation and cookie issuing all
 * happen server-side; the client receives only where to go next.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const input = await parseJson(request, loginSchema);

  const result = await login(
    { identifier: input.identifier, password: input.password, remember: input.remember },
    { ip: clientIp(request), userAgent: request.headers.get('user-agent') },
  );

  return ok({ redirectTo: result.redirectTo });
});
