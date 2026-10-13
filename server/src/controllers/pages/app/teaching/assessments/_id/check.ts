import { notFound } from '@/server/lib/page-signals';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { assessmentDetail } from '@/server/services/teaching/assessments';
import { orNotFound, queryId } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Answer-sheet checking for one assessment. */

export async function loadTeachingAssessmentsIdCheck({ params }: PageRequest) {
  const user = await requireUser();
  authorizePage(teachingPolicy.teach(user));
  const id = queryId((params).id);
  if (!id) notFound();
  const data = await orNotFound(assessmentDetail(user, id));
  const a = data.assessment;
  const ready = data.items.length > 0 && a.scoreStatus === 'DRAFT' && !data.cls.archived;

  return { a, data, ready };
}
