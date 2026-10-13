import { authorizePage, requireUser } from '@/server/auth/current-user';
import { staffPdsPolicy } from '@/server/auth/policies';
import { ownPds } from '@/server/services/teaching/pds';
import type { PageRequest } from '@/server/controllers/pages/types';

/** The signed-in staff member's own Personal Data Sheet. */

export async function loadTeachingPds(_request: PageRequest) {
  const user = await requireUser();
  authorizePage(staffPdsPolicy.keepOwn(user));
  const pds = await ownPds(user);

  return { pds, user };
}
