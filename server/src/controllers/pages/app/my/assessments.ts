import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentPortalPolicy } from '@/server/auth/policies';
import { studentAssessments } from '@/server/services/teaching/assessments';
import { orNotFound } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** A student's quizzes, examinations, activities and PT — schedules, and results once released. */

export async function loadMyAssessments(_request: PageRequest) {
  const user = await requireUser();
  authorizePage(studentPortalPolicy.use(user));
  const rows = await orNotFound(studentAssessments(user));
  const open = rows.filter((r) => r.canTake);
  const upcoming = rows.filter((r) => r.phase === 'SCHEDULED');
  const rest = rows.filter((r) => !r.canTake && r.phase !== 'SCHEDULED');


  return { open, rest, rows, upcoming };
}
