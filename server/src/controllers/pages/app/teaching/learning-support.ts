import { teachingPolicy } from '@/server/auth/policies';
import { instructorLearningSupports } from '@/server/services/teaching/student-support';
import { yearPage } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Learning Support — the Instructor's recommendations and their follow-up. */

export async function loadTeachingLearningSupport({ query }: PageRequest) {
  const { year } = query;
  const ctx = await yearPage(teachingPolicy.teach, year);
  const rows = await instructorLearningSupports(ctx.user, ctx.yearId);

  return { ctx, rows };
}
