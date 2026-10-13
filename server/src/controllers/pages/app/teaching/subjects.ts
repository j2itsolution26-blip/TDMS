import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { yearPage } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** My Subjects — the subjects this Instructor teaches, with the sections for each. */

export async function loadTeachingSubjects({ query }: PageRequest) {
  const { year } = query;
  const ctx = await yearPage(teachingPolicy.teach, year);
  const classes = await instructorClasses(ctx.user, ctx.yearId);

  const bySubject = new Map<string, { code: string; title: string; classes: typeof classes }>();
  for (const c of classes) {
    const key = c.subject.id.toString();
    const entry = bySubject.get(key) ?? { code: c.subject.code, title: c.subject.title, classes: [] };
    entry.classes.push(c);
    bySubject.set(key, entry);
  }
  const subjects = [...bySubject.values()].sort((a, b) => a.code.localeCompare(b.code));

  return { classes, ctx, subjects };
}
