import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentPortalPolicy } from '@/server/auth/policies';
import { ownAttendance } from '@/server/services/teaching/student-portal';
import { orNotFound } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

export async function loadMyAttendance(_request: PageRequest) {
  const user = await requireUser();
  authorizePage(studentPortalPolicy.use(user));
  const data = await orNotFound(ownAttendance(user));
  const t = data.totals;

  return { data, t };
}
