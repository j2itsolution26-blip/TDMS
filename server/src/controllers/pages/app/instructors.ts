import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { instructorProfiles } from '@/server/services/teaching/pds';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Instructor Profiles — the Director's view of every Diploma Instructor's PDS completion. */

export async function loadInstructors(_request: PageRequest) {
  const user = await requireUser();
  authorizePage(teachingPolicy.viewInstructorProfiles(user));
  const rows = await instructorProfiles(user);

  return { rows };
}
