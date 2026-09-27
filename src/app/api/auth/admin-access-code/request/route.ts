import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, requestContext } from '@/server/api-handler';
import { requestNewAccessCode } from '@/server/services/admin-login-service';

/**
 * POST /api/auth/admin-access-code/request
 *
 * Asks the Super Admins for a new code. It ISSUES NOTHING — an account that
 * could mint its own access code has a one-factor sign-in with extra steps —
 * so the entire effect is an audit record and, when mail is configured, an
 * email to the Super Admins saying who is waiting.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  return ok(await requestNewAccessCode(requestContext(request)));
});
