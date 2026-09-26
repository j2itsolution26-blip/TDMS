import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, clientIp } from '@/server/api-handler';
import { requestPasswordReset } from '@/server/services/account-service';
import { forgotPasswordSchema } from '@/server/validation/schemas';
import {
  checkLoginThrottle,
  hitLoginThrottle,
  loginThrottleKey,
} from '@/server/auth/rate-limit';

/**
 * POST /api/auth/forgot-password
 *
 * Always answers the same way, whether or not an account exists. Saying
 * otherwise would turn this into an account-enumeration oracle, and the form
 * is reachable without signing in.
 *
 * Throttled on address + IP, because sending mail costs money and an
 * unthrottled endpoint is a way to flood somebody's inbox.
 */
const SAME_ANSWER =
  'If that institutional address has a TDMS account, a password reset link is on its way.';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const { email } = await parseJson(request, forgotPasswordSchema);
  const key = loginThrottleKey(`reset:${email}`, clientIp(request));

  const throttle = await checkLoginThrottle(key);
  // Even when throttled, answer identically — a different response here
  // would leak that the address is being targeted.
  if (!throttle.limited) {
    await hitLoginThrottle(key);
    await requestPasswordReset(email);
  }

  return ok({ message: SAME_ANSWER });
});
