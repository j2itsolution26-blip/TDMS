import { teachingPolicy } from '@/server/auth/policies';
import { reviewQueue } from '@/server/services/teaching/documents';
import { yearPage } from '@/server/services/teaching/page-context';
import { DOCUMENT_KINDS, DOCUMENT_STATUSES, type DocumentKind, type DocumentStatus } from '@/lib/teaching';
import { PageShell } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import ReviewQueue from '@/components/teaching/ReviewQueue';

export const dynamic = 'force-dynamic';

/** Academic Documents — the Director's and Coordinator's review of lesson plans, TOS and PT. */
export default async function AcademicReviewsPage({ searchParams }: { searchParams: Promise<{ year?: string; kind?: string; status?: string }> }) {
  const sp = await searchParams;
  const ctx = await yearPage(teachingPolicy.viewAcademicDocuments, sp.year);
  const kind = DOCUMENT_KINDS.includes(sp.kind as DocumentKind) ? (sp.kind as DocumentKind) : null;
  const status = DOCUMENT_STATUSES.includes(sp.status as DocumentStatus) && sp.status !== 'DRAFT' ? (sp.status as DocumentStatus) : null;
  const rows = await reviewQueue(ctx.user, { kind, status, schoolYearId: ctx.yearId });

  return (
    <PageShell eyebrow="Academic Oversight" title="Academic Documents" description="Lesson plans, Tables of Specifications and Performance Task documentation submitted by Diploma Instructors." actions={<YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />}>
      <ReviewQueue rows={rows} canReview={teachingPolicy.reviewAcademicDocuments(ctx.user)} kind={kind ?? ''} status={status ?? ''} />
    </PageShell>
  );
}
