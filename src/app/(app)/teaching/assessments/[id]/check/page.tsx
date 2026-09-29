import Link from 'next/link';
import { notFound } from 'next/navigation';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { assessmentDetail } from '@/server/services/teaching/assessments';
import { orNotFound, queryId } from '@/server/services/teaching/page-context';
import { BTN, Empty, PageShell } from '@/components/teaching/kit';
import SheetChecker from '@/components/teaching/SheetChecker';

export const dynamic = 'force-dynamic';

/** Answer-sheet checking for one assessment. */
export default async function CheckSheetsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  authorizePage(teachingPolicy.teach(user));
  const id = queryId((await params).id);
  if (!id) notFound();
  const data = await orNotFound(assessmentDetail(user, id));
  const a = data.assessment;
  const ready = data.items.length > 0 && a.scoreStatus === 'DRAFT' && !data.cls.archived;

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
