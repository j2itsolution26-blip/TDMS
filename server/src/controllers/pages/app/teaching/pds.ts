import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { ownPds } from '@/server/services/teaching/pds';
import type { PageRequest } from '@/server/controllers/pages/types';

/** The Instructor's own Personal Data Sheet. */

export async function loadTeachingPds(_request: PageRequest) {
  const user = await requireUser();
  authorizePage(teachingPolicy.teach(user));
  const pds = await ownPds(user);

  return { pds, user };
}
