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
 * happen server-side; the client receives only which step it is on and where
 * to go next.
 *
 * A 200 from here does NOT always mean "signed in". For an Admin it means the
 * password was right and a second factor is outstanding — see
 * src/server/services/auth-service.ts.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const input = await parseJson(request, loginSchema);

  const result = await login(
    { identifier: input.identifier, password: input.password, remember: input.remember },
    { ip: clientIp(request), userAgent: request.headers.get('user-agent') },
  );

  /*
   * `stage` matters to the caller. For an Admin, a correct password has NOT
   * signed them in — it has opened a challenge, and the browser must go to the
   * access-code screen rather than to any ?redirect= it was carrying.
   */
  return ok({ stage: result.stage, redirectTo: result.redirectTo });
});
