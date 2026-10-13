import { authorizePage, requireUser } from '@/server/auth/current-user';
import { staffPdsPolicy } from '@/server/auth/policies';
import { staffProfiles } from '@/server/services/teaching/pds';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Staff Profiles — the PDS of every staff member this viewer may read, with completion. */

export async function loadInstructors(_request: PageRequest) {
  const user = await requireUser();
  authorizePage(staffPdsPolicy.viewAny(user));
  return staffProfiles(user);
}
