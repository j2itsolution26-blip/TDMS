import AssessmentListPage from '@/components/teaching/AssessmentListPage';

export const dynamic = 'force-dynamic';

export default function PerformanceTasksPage({ searchParams }: { searchParams: Promise<{ year?: string; class?: string }> }) {
  return <AssessmentListPage kind="PT" searchParams={searchParams} />;
}
