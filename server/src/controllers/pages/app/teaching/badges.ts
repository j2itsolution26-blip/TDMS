import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, classRoster, instructorClasses, studentName } from '@/server/services/teaching/access';
import { instructorBadges } from '@/server/services/teaching/student-support';
import { yearPage } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Badges — recognise students in your classes; each award notifies the student. */

export async function loadTeachingBadges({ query }: PageRequest) {
  const { year } = query;
  const ctx = await yearPage(teachingPolicy.teach, year);
  const [classes, badges] = await Promise.all([instructorClasses(ctx.user, ctx.yearId), instructorBadges(ctx.user, ctx.yearId)]);
  const rosters = await Promise.all(classes.map((c) => classRoster(c.sectionId)));

  return { badges, classes, ctx, rosters, year };
}
