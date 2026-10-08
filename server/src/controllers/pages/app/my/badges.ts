import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentPortalPolicy } from '@/server/auth/policies';
import { requireStudentRecord } from '@/server/services/teaching/access';
import { studentBadges } from '@/server/services/teaching/student-support';
import { orNotFound } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

export async function loadMyBadges(_request: PageRequest) {
  const user = await requireUser();
  authorizePage(studentPortalPolicy.use(user));
  const student = await orNotFound(requireStudentRecord(user));
  const badges = await studentBadges(student.id);

  return { badges };
}
