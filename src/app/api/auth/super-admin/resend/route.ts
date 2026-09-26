import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, requestContext } from '@/server/api-handler';
import { resendCode } from '@/server/services/super-admin-service';

/**
 * POST /api/auth/super-admin/resend — issue a replacement code.
 *
 * Takes no body: the registration it refers to is the one named by the
 * HttpOnly cookie, so a caller cannot ask for a code to be sent to an address
 * of their choosing. Rate limited per registration, per address and per IP.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  return ok(await resendCode(requestContext(request)));
});
