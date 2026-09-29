import AssessmentListPage from '@/components/teaching/AssessmentListPage';

export const dynamic = 'force-dynamic';

export default function OnlineActivitiesPage({ searchParams }: { searchParams: Promise<{ year?: string; class?: string }> }) {
  return <AssessmentListPage kind="ACTIVITY" searchParams={searchParams} />;
}
