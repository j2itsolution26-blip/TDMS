import { prisma } from '@/server/lib/prisma';
import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { yearPage } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** My Classes — every class assigned to this Diploma Instructor in the chosen school year. */

export async function loadTeachingClasses({ query }: PageRequest) {
  const { year } = query;
  const ctx = await yearPage(teachingPolicy.teach, year);
  const classes = await instructorClasses(ctx.user, ctx.yearId);
  const counts = classes.length
    ? await prisma.sectionStudent.groupBy({ by: ['sectionId'], where: { sectionId: { in: classes.map((c) => c.sectionId) } }, _count: { _all: true } })
    : [];
  const roster = new Map(counts.map((c) => [c.sectionId.toString(), c._count._all]));

  return { classes, ctx, roster };
}
