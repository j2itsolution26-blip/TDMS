import { ok } from '@/lib/http';
import { withErrorHandling } from '@/server/api-handler';
import { logout } from '@/server/services/auth-service';

/** POST /api/auth/logout — destroys the session row and clears the cookie. */
export const POST = withErrorHandling(async () => {
  await logout();
  return ok({ redirectTo: '/login' });
});
