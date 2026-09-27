import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { adminAccessCodeSchema } from '@/server/validation/schemas';
import {
  describeAdminChallenge,
  verifyAdminAccessCode,
  abandonAdminChallenge,
} from '@/server/services/admin-login-service';

/**
 * The access-code step of an Admin sign-in.
 *
 * Every method here is reachable WITHOUT a session, and that is correct: the
 * caller has passed the password step and has not been let in yet. What
 * authorises them is the HttpOnly challenge cookie, which names one
 * half-finished sign-in and permits exactly one thing — submitting a code.
 *
 * Nothing in any response identifies the account beyond the address the
 * caller themselves typed a password for, and no response ever contains a
 * code, a hash or a user id.
 */

/** GET — what the screen should draw, or `{ challenge: null }` if nothing is in progress. */
export const GET = withErrorHandling(async () => {
  return ok({ challenge: await describeAdminChallenge() });
});

/** POST — submit the code. On success a session is created and the cookie cleared. */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const input = await parseJson(request, adminAccessCodeSchema);
  const result = await verifyAdminAccessCode(input.code, requestContext(request));
  return ok({ redirectTo: result.redirectTo });
});

/** DELETE — give up and go back to the password screen. */
export const DELETE = withErrorHandling(async () => {
  await abandonAdminChallenge();
  return ok({ abandoned: true });
});
