import { ok } from '@/lib/http';
import { withErrorHandling } from '@/server/api-handler';
import {
  pendingRegistrationState,
  abandonRegistration,
} from '@/server/services/super-admin-service';

/**
 * GET /api/auth/super-admin/pending — resume a verification in progress.
 *
 * This is what makes refreshing the page harmless: the browser asks where it
 * had got to and the server answers from the pending row named by the
 * HttpOnly cookie. `null` means there is nothing in progress, which is a
 * normal answer rather than an error.
 *
 * It returns the address being verified and the timers. It does not return the
 * code, its hash, the password hash, or any identifier for the row.
 */
export const GET = withErrorHandling(async () => {
  return ok({ pending: await pendingRegistrationState() });
});

/** DELETE — abandon the attempt, for the "start over" link. */
export const DELETE = withErrorHandling(async () => {
  await abandonRegistration();
  return ok({ pending: null });
});
