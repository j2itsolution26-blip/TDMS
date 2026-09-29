import AssessmentListPage from '@/components/teaching/AssessmentListPage';

export const dynamic = 'force-dynamic';

export default function QuizzesPage({ searchParams }: { searchParams: Promise<{ year?: string; class?: string }> }) {
  return <AssessmentListPage kind="QUIZ" searchParams={searchParams} />;
}
