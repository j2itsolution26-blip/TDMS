import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { gradebook } from '@/server/services/teaching/gradebook';
import { queryId, yearPage } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** The Instructor Gradebook, one class at a time (the class picker is the section filter). */

export async function loadTeachingGradebook({ query }: PageRequest) {
  const sp = query;
  const ctx = await yearPage(teachingPolicy.teach, sp.year);
  const classes = await instructorClasses(ctx.user, ctx.yearId);
  const picked = classes.find((c) => c.id === queryId(sp.class)) ?? classes[0] ?? null;
  const book = picked ? await gradebook(ctx.user, picked.id) : null;

  return { book, classes, ctx, picked };
}
