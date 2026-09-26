import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { verificationCodeSchema } from '@/server/validation/schemas';
import { verifyCode } from '@/server/services/super-admin-service';

/**
 * POST /api/auth/super-admin/verify — step 2 of the bootstrap.
 *
 * Checks the emailed code against the pending registration this browser
 * holds. Success proves the address and nothing more: no account is created
 * here, and no session is issued. Attempts are capped per registration and
 * throttled per IP.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const input = await parseJson(request, verificationCodeSchema);
  return ok(await verifyCode(input.code, requestContext(request)));
});
