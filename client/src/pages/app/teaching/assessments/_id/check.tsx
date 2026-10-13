import Link from '@/lib/link';
import { BTN, Empty, PageShell } from '@/components/teaching/kit';
import SheetChecker from '@/components/teaching/SheetChecker';
import { useParams } from 'react-router-dom';
import { Page } from '@/lib/page-data';
import type { loadTeachingAssessmentsIdCheck } from '@/server/controllers/pages/app/teaching/assessments/_id/check';

type Data = Awaited<ReturnType<typeof loadTeachingAssessmentsIdCheck>>;

function View({ a, data, ready }: Data) {
  return (
    <PageShell back={{ href: `/teaching/assessments/${a.id}`, label: a.title }} eyebrow="Answer Key / Checking" title={`Check sheets — ${a.title}`} description={`${data.cls.subject} · ${data.cls.detail} · ${a.totalPoints} points`}>
      {ready ? (
        <SheetChecker assessmentId={a.id} itemCount={data.items.length} />
      ) : (
        <Empty
          title={data.items.length === 0 ? 'Set the answer key first' : 'Results are locked'}
          description={data.items.length === 0 ? 'Sheets are scored against the answer key.' : 'Reopen the results to check more sheets.'}
          action={<Link href={`/teaching/assessments/${a.id}`} className={BTN}>Open the assessment</Link>}
        />
      )}
    </PageShell>
  );
}

/** /teaching/assessments/[id]/check */
export default function TeachingAssessmentsIdCheckPage() {
  const { id } = useParams() as { id: string };
  return <Page<Data> endpoint={`/teaching/assessments/${id}/check`} render={(d) => <View {...d} />} />;
}
