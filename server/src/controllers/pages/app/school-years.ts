import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { listSchoolYears } from '@/server/services/teaching/school-years';
import type { PageRequest } from '@/server/controllers/pages/types';

/** School Years — the lifecycle: upcoming, active, archived. */

export async function loadSchoolYears(_request: PageRequest) {
  const user = await requireUser();
  authorizePage(teachingPolicy.viewSchoolYears(user));
  const years = await listSchoolYears();

  return { user, years };
}
