import { teachingPolicy } from '@/server/auth/policies';
import { instructorStudents, listStatusRequests } from '@/server/services/teaching/student-support';
import { yearPage } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Students — only those on this Instructor's class rosters. */

export async function loadTeachingStudents({ query }: PageRequest) {
  const { year } = query;
  const ctx = await yearPage(teachingPolicy.teach, year);
  const [data, requests] = await Promise.all([instructorStudents(ctx.user, ctx.yearId), listStatusRequests(ctx.user, { mine: true })]);

  return { ctx, data, requests };
}
