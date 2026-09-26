import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, requestContext } from '@/server/api-handler';
import { completeRegistration } from '@/server/services/super-admin-service';

/**
 * POST /api/auth/super-admin — step 3, the one-time bootstrap itself.
 *
 * Creates the Super Admin from a pending registration whose email address has
 * already been verified, assigns the role, marks the address verified, and
 * issues the first session. It takes NO body: the name, address and password
 * hash all come from the pending row named by the HttpOnly cookie, so nothing
 * about the account can be changed between verification and creation.
 *
 * It is safe to leave unauthenticated ONLY because of what it demands:
 *   * bootstrap must still be allowed — false the instant a Super Admin
 *     exists, and re-checked inside the transaction so it cannot be raced;
 *   * the request must carry the setup cookie for a pending registration;
 *   * that registration must have a non-null `verifiedAt`.
 *
 * Without a verified code this endpoint cannot create anything, which is the
 * guarantee the whole flow is built around.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const created = await completeRegistration(requestContext(request));
  return ok({ id: created.id, email: created.email, redirectTo: created.redirectTo }, 201);
});
