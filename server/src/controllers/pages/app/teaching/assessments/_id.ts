import { notFound } from '@/server/lib/page-signals';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { assessmentDetail } from '@/server/services/teaching/assessments';
import { orNotFound, queryId } from '@/server/services/teaching/page-context';
import { prisma } from '@/server/lib/prisma';
import type { PageRequest } from '@/server/controllers/pages/types';

export async function loadTeachingAssessmentsId({ params }: PageRequest) {
  const user = await requireUser();
  authorizePage(teachingPolicy.teach(user));
  const id = queryId((params).id);
  if (!id) notFound();
  const data = await orNotFound(assessmentDetail(user, id));
  const cls = await prisma.classOffering.findUniqueOrThrow({ where: { id: BigInt(data.cls.id) }, select: { schoolYearId: true } });
  const classes = await instructorClasses(user, cls.schoolYearId);
  const a = data.assessment;

  return { a, classes, data, id };
}
