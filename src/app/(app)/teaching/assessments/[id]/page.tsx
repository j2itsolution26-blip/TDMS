import { notFound } from 'next/navigation';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { assessmentDetail } from '@/server/services/teaching/assessments';
import { orNotFound, queryId } from '@/server/services/teaching/page-context';
import { prisma } from '@/lib/prisma';
import { ASSESSMENT_KIND_LABELS, ASSESSMENT_KIND_PLURALS, EXAM_TYPE_LABELS, type ExamType } from '@/lib/teaching';
import { ArchivedNote, PageShell } from '@/components/teaching/kit';
import AssessmentDetail from '@/components/teaching/AssessmentDetail';

export const dynamic = 'force-dynamic';

const LIST = { QUIZ: '/teaching/quizzes', EXAM: '/teaching/exams', ACTIVITY: '/teaching/activities', PT: '/teaching/performance-tasks' } as const;

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  authorizePage(teachingPolicy.teach(user));
  const id = queryId((await params).id);
  if (!id) notFound();
  const data = await orNotFound(assessmentDetail(user, id));
  const cls = await prisma.classOffering.findUniqueOrThrow({ where: { id: BigInt(data.cls.id) }, select: { schoolYearId: true } });
  const classes = await instructorClasses(user, cls.schoolYearId);
  const a = data.assessment;

  return (
    <PageShell
      back={{ href: LIST[a.kind], label: ASSESSMENT_KIND_PLURALS[a.kind] }}
      eyebrow={a.examType ? EXAM_TYPE_LABELS[a.examType as ExamType] : ASSESSMENT_KIND_LABELS[a.kind]}
      title={a.title}
      description={`${data.cls.subject} · ${data.cls.detail}`}
    >
      {data.cls.archived && <ArchivedNote label="of this class" />}
      <AssessmentDetail data={data} classes={classes.map((c) => ({ id: c.id.toString(), label: `${c.subject.title} — ${classHeading(c).detail}` }))} />
    </PageShell>
  );
}
