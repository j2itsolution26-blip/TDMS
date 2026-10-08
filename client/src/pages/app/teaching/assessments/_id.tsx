import { classHeading } from '@shared/lib/teaching-labels';
import { ASSESSMENT_KIND_LABELS, ASSESSMENT_KIND_PLURALS, EXAM_TYPE_LABELS, type ExamType } from '@shared/lib/teaching';
import { ArchivedNote, PageShell } from '@/components/teaching/kit';
import AssessmentDetail from '@/components/teaching/AssessmentDetail';
import { useParams } from 'react-router-dom';
import { Page } from '@/lib/page-data';
import type { loadTeachingAssessmentsId } from '@/server/controllers/pages/app/teaching/assessments/_id';

const LIST = { QUIZ: '/teaching/quizzes', EXAM: '/teaching/exams', ACTIVITY: '/teaching/activities', PT: '/teaching/performance-tasks' } as const;

type Data = Awaited<ReturnType<typeof loadTeachingAssessmentsId>>;

function View({ a, classes, data, id }: Data) {
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

/** /teaching/assessments/[id] */
export default function TeachingAssessmentsIdPage() {
  const { id } = useParams() as { id: string };
  return <Page<Data> endpoint={`/teaching/assessments/${id}`} render={(d) => <View {...d} />} />;
}
