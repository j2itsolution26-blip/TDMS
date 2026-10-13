import { teachingPolicy } from '@shared/lib/policies';
import { PageShell } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import ReviewQueue from '@/components/teaching/ReviewQueue';
import { Page } from '@/lib/page-data';
import type { loadAcademicReviews } from '@/server/controllers/pages/app/academic-reviews';

type Data = Awaited<ReturnType<typeof loadAcademicReviews>>;

function View({ ctx, kind, rows, status }: Data) {
  return (
    <PageShell eyebrow="Academic Oversight" title="Academic Documents" description="Lesson plans, Tables of Specifications and Performance Task documentation submitted by Diploma Instructors." actions={<YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />}>
      <ReviewQueue rows={rows} canReview={teachingPolicy.reviewAcademicDocuments(ctx.user)} kind={kind ?? ''} status={status ?? ''} />
    </PageShell>
  );
}

/** /academic-reviews */
export default function AcademicReviewsPage() {
  return <Page<Data> endpoint={'/academic-reviews'} render={(d) => <View {...d} />} />;
}
