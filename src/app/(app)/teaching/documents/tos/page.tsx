import DocumentsPage from '@/components/teaching/DocumentsPage';

export const dynamic = 'force-dynamic';

export default function TosPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  return <DocumentsPage kind="TOS" searchParams={searchParams} />;
}
