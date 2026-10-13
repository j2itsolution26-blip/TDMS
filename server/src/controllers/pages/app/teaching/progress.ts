import { teachingPolicy } from '@/server/auth/policies';
import { studentProgress } from '@/server/services/teaching/student-support';
import { yearPage } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Student Progress — each student's running grade and attendance, per class, with who may need support. */

export async function loadTeachingProgress({ query }: PageRequest) {
  const { year } = query;
  const ctx = await yearPage(teachingPolicy.teach, year);
  const classes = await studentProgress(ctx.user, ctx.yearId);

  return { classes, ctx };
}
