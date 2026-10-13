import { requireUser } from '@/server/auth/current-user';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Port of resources/views/profile.blade.php. */

export async function loadProfile(_request: PageRequest) {
  const user = await requireUser();

  return {
    user: {
        name: user.name,
        email: user.email,
        username: user.username,
        emailVerified: user.emailVerifiedAt !== null,
      },
  };
}
