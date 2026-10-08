import { notFound } from '@/server/lib/page-signals';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentPortalPolicy } from '@/server/auth/policies';
import { studentAssessmentDetail } from '@/server/services/teaching/assessments';
import { orNotFound, queryId } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

export async function loadMyAssessmentsId({ params }: PageRequest) {
  const user = await requireUser();
  authorizePage(studentPortalPolicy.use(user));
  const id = queryId((params).id);
  if (!id) notFound();
  const a = await orNotFound(studentAssessmentDetail(user, id));

  return { a };
}
