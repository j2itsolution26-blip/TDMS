import { ok } from '@/lib/http';
import { withErrorHandling } from '@/server/api-handler';
import { getCurrentUser } from '@/server/auth/current-user';

/**
 * GET /api/auth/session — who am I?
 *
 * Returns the principal without the password hash or any session token;
 * `select` in getCurrentUser never loads the hash in the first place.
 */
export const GET = withErrorHandling(async () => {
  const user = await getCurrentUser();
  return ok({ user });
});
