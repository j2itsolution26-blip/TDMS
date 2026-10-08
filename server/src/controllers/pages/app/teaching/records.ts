import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { gradebook } from '@/server/services/teaching/gradebook';
import { queryId, yearPage } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/**
 * Class Records — the whole record of a class in one table: who each student
 * is, their attendance, each category's standing, the final grade and remarks.
 * Records are created and changed where they are made (attendance, the
 * assessments, the gradebook); this is where they are read together.
 */

export async function loadTeachingRecords({ query }: PageRequest) {
  const sp = query;
  const ctx = await yearPage(teachingPolicy.teach, sp.year);
  const classes = await instructorClasses(ctx.user, ctx.yearId);
  const picked = classes.find((c) => c.id === queryId(sp.class)) ?? classes[0] ?? null;
  const book = picked ? await gradebook(ctx.user, picked.id) : null;

  return { book, classes, ctx, picked };
}
