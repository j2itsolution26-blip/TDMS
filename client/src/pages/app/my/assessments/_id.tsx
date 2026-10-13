import { PageShell } from '@/components/teaching/kit';
import TakeAssessment from '@/components/teaching/TakeAssessment';
import { useParams } from 'react-router-dom';
import { Page } from '@/lib/page-data';
import type { loadMyAssessmentsId } from '@/server/controllers/pages/app/my/assessments/_id';

type Data = Awaited<ReturnType<typeof loadMyAssessmentsId>>;

function View({ a }: Data) {
  return (
    <PageShell back={{ href: '/my/assessments', label: 'Quizzes & Exams' }} eyebrow={a.kindLabel} title={a.title} description={a.subject}>
      <TakeAssessment initial={a} />
    </PageShell>
  );
}

/** /my/assessments/[id] */
export default function MyAssessmentsIdPage() {
  const { id } = useParams() as { id: string };
  return <Page<Data> endpoint={`/my/assessments/${id}`} render={(d) => <View {...d} />} />;
}
