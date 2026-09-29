import { notFound } from 'next/navigation';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentPortalPolicy } from '@/server/auth/policies';
import { studentAssessmentDetail } from '@/server/services/teaching/assessments';
import { orNotFound, queryId } from '@/server/services/teaching/page-context';
import { PageShell } from '@/components/teaching/kit';
import TakeAssessment from '@/components/teaching/TakeAssessment';

export const dynamic = 'force-dynamic';

export default async function MyAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  authorizePage(studentPortalPolicy.use(user));
  const id = queryId((await params).id);
  if (!id) notFound();
  const a = await orNotFound(studentAssessmentDetail(user, id));
  return (
    <PageShell back={{ href: '/my/assessments', label: 'Quizzes & Exams' }} eyebrow={a.kindLabel} title={a.title} description={a.subject}>
      <TakeAssessment initial={a} />
    </PageShell>
  );
}
