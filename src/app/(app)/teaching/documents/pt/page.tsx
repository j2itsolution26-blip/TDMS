import DocumentsPage from '@/components/teaching/DocumentsPage';

export const dynamic = 'force-dynamic';

export default function PerformanceTaskDocumentsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  return <DocumentsPage kind="PT" searchParams={searchParams} />;
}
