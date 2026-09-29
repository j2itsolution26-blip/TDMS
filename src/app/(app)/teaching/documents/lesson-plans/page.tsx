import DocumentsPage from '@/components/teaching/DocumentsPage';

export const dynamic = 'force-dynamic';

export default function LessonPlansPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  return <DocumentsPage kind="LESSON_PLAN" searchParams={searchParams} />;
}
