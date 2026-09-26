import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { superAdminRegistrationSchema } from '@/server/validation/schemas';
import { startRegistration } from '@/server/services/super-admin-service';

/**
 * POST /api/auth/super-admin/start — step 1 of the bootstrap.
 *
 * Validates the registration details, stores them pending with the password
 * already hashed, and emails a verification code. It creates no account, no
 * role and no session; the response says only what the verification screen
 * needs to draw itself, and never the code.
 *
 * Public by necessity, like the rest of this flow: nobody can sign in yet.
 * That is safe because isBootstrapAllowed() is false the instant a Super
 * Admin exists, and it is re-checked at every step including inside the
 * transaction that finally creates the account.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const input = await parseJson(request, superAdminRegistrationSchema);

  const state = await startRegistration(
    { name: input.name, email: input.email, password: input.password },
    requestContext(request),
  );

  return ok(state, 201);
});
