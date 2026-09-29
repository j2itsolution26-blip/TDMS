import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { instructorDocuments } from '@/server/services/teaching/documents';
import { yearPage } from '@/server/services/teaching/page-context';
import { DOCUMENT_KIND_LABELS, type DocumentKind } from '@/lib/teaching';
import { ArchivedNote, PageShell } from './kit';
import { YearSwitcher } from './client-kit';
import DocumentsScreen from './DocumentsScreen';

const DESCRIPTIONS: Record<DocumentKind, string> = {
  LESSON_PLAN: 'Create, upload and submit lesson plans. The TVET Director and Coordinator review them.',
  TOS: 'Tables of Specifications for your assessments, submitted for review.',
  PT: 'Performance Task documentation — task, criteria and rubric — submitted for review.',
};

/** The shared server page behind Lesson Plans, TOS and PT. */
export default async function DocumentsPage({ kind, searchParams }: { kind: DocumentKind; searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  const ctx = await yearPage(teachingPolicy.teach, year);
  const [classes, rows] = await Promise.all([instructorClasses(ctx.user, ctx.yearId), instructorDocuments(ctx.user, kind, ctx.yearId)]);
  return (
    <PageShell eyebrow="Documents" title={kind === 'LESSON_PLAN' ? 'Lesson Plans' : DOCUMENT_KIND_LABELS[kind]} description={DESCRIPTIONS[kind]} actions={<YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />}>
      {ctx.archived && ctx.current && <ArchivedNote label={ctx.current.label} />}
      <DocumentsScreen kind={kind} rows={rows} archived={ctx.archived} classes={classes.map((c) => ({ id: c.id.toString(), label: `${c.subject.title} — ${classHeading(c).detail}` }))} />
    </PageShell>
  );
}
