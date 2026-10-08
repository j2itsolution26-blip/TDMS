import { teachingPolicy } from '@/server/auth/policies';
import { listInstructorAssessments } from '@/server/services/teaching/assessments';
import { yearPage } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Answer Key / Checking — every assessment, with where its key and checking stand. */

export async function loadTeachingChecking({ query }: PageRequest) {
  const { year } = query;
  const ctx = await yearPage(teachingPolicy.teach, year);
  const rows = await listInstructorAssessments(ctx.user, ctx.yearId, ['QUIZ', 'EXAM', 'ACTIVITY', 'PT']);
  const toCheck = rows.filter((r) => r.scoreStatus === 'DRAFT');
  const done = rows.filter((r) => r.scoreStatus !== 'DRAFT');


  return { ctx, done, toCheck };
}
