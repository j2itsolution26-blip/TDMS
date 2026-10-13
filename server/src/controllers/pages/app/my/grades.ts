import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentPortalPolicy } from '@/server/auth/policies';
import { requireStudentRecord } from '@/server/services/teaching/access';
import { studentGrades } from '@/server/services/teaching/gradebook';
import { orNotFound } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** A student's released final grades. Unreleased grades are never sent. */

export async function loadMyGrades(_request: PageRequest) {
  const user = await requireUser();
  authorizePage(studentPortalPolicy.use(user));
  const student = await orNotFound(requireStudentRecord(user));
  const rows = await studentGrades(student.id);

  return { rows };
}
