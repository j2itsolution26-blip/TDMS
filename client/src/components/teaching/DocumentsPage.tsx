import { DOCUMENT_KIND_LABELS, type DocumentKind } from '@shared/lib/teaching';
import { Page } from '@/lib/page-data';
import type { DocumentsData } from '@/server/controllers/pages/app/teaching/lists';
import { ArchivedNote, PageShell } from './kit';
import { YearSwitcher } from './client-kit';
import DocumentsScreen from './DocumentsScreen';

const DESCRIPTIONS: Record<DocumentKind, string> = {
  LESSON_PLAN: 'Create, upload and submit lesson plans. The TVET Director and Coordinator review them.',
  TOS: 'Tables of Specifications for your assessments, submitted for review.',
  PT: 'Performance Task documentation — task, criteria and rubric — submitted for review.',
};

/** The shared page behind Lesson Plans, TOS and PT. */
export default function DocumentsPage({ kind, endpoint }: { kind: DocumentKind; endpoint: string }) {
  return (
    <Page<DocumentsData>
      endpoint={endpoint}
      render={(d) => (
        <PageShell eyebrow="Documents" title={kind === 'LESSON_PLAN' ? 'Lesson Plans' : DOCUMENT_KIND_LABELS[kind]} description={DESCRIPTIONS[kind]} actions={<YearSwitcher years={d.years} current={d.current?.id ?? null} />}>
          {d.archived && d.current && <ArchivedNote label={d.current.label} />}
          <DocumentsScreen kind={kind} rows={d.rows} archived={d.archived} classes={d.classes} />
        </PageShell>
      )}
    />
  );
}
