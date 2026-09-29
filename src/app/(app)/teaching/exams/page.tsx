import AssessmentListPage from '@/components/teaching/AssessmentListPage';

export const dynamic = 'force-dynamic';

export default function ExaminationsPage({ searchParams }: { searchParams: Promise<{ year?: string; class?: string }> }) {
  return <AssessmentListPage kind="EXAM" searchParams={searchParams} />;
}
