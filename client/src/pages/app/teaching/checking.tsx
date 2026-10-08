import { Card, Empty, PageShell } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import { Page } from '@/lib/page-data';
import type { loadTeachingChecking } from '@/server/controllers/pages/app/teaching/checking';
import Link from '@/lib/link';
import { Chip, FOCUS, TD, TH, Table } from '@/components/teaching/kit';
import { ASSESSMENT_PHASE_LABELS, SCORE_STATUS_LABELS, type ScoreStatus } from '@shared/lib/teaching';

type Data = Awaited<ReturnType<typeof loadTeachingChecking>>;

function View({ ctx, done, toCheck }: Data) {
  const table = (list: Data['done'], label: string) => (
    <Table
      label={label}
      head={
        <>
          <th scope="col" className={TH}>Assessment</th>
          <th scope="col" className={TH}>Class</th>
          <th scope="col" className={TH}>Answer key</th>
          <th scope="col" className={TH}>Checked</th>
          <th scope="col" className={TH}>Status</th>
          <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
        </>
      }
    >
      {list.map((r) => (
        <tr key={r.id}>
          <td className={TD}>
            <span className="block font-semibold">{r.title}</span>
            <span className="text-xs text-tdms-muted">{r.kindLabel}</span>
          </td>
          <td className={TD}>{r.subject}<span className="block text-xs text-tdms-muted">{r.classDetail}</span></td>
          <td className={TD}>{r.keyItems > 0 ? <Chip status="APPROVED" label={`${r.keyItems} items`} /> : <Chip status="DRAFT" label="Not set" />}</td>
          <td className={`${TD} tabular-nums`}>{r.scored} / {r.roster}</td>
          <td className={TD}>
            <Chip status={r.scoreStatus === 'DRAFT' ? r.phase : r.scoreStatus} label={r.scoreStatus === 'DRAFT' ? ASSESSMENT_PHASE_LABELS[r.phase] : SCORE_STATUS_LABELS[r.scoreStatus as ScoreStatus]} />
          </td>
          <td className={`${TD} whitespace-nowrap text-right`}>
            {r.scoreStatus === 'DRAFT' && r.keyItems > 0 && !r.archived && (
              <Link href={`/teaching/assessments/${r.id}/check`} className={`mr-3 rounded-lg bg-tdms-text px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0B6A45] ${FOCUS}`}>Check sheets</Link>
            )}
            <Link href={`/teaching/assessments/${r.id}`} className={`rounded text-[13px] font-semibold text-tdms-text hover:underline ${FOCUS}`}>{r.keyItems > 0 ? 'Open' : 'Set key'}</Link>
          </td>
        </tr>
      ))}
    </Table>
  );

  return (
    <PageShell
      eyebrow="Assessments"
      title="Answer Key / Checking"
      description="Set each assessment's answer key, then check paper sheets by scanning the student's QR. Online answers are scored automatically."
      actions={<YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />}
    >
      <Card title="To check" description="Results still in draft" padded={false}>
        {toCheck.length === 0 ? <div className="px-5 pb-5 sm:px-6"><Empty title="Nothing to check" description="Assessments whose results are still in draft appear here." /></div> : table(toCheck, 'Assessments to check')}
      </Card>
      {done.length > 0 && (
        <Card title="Finalized and released" padded={false}>
          {table(done, 'Finalized assessments')}
        </Card>
      )}
    </PageShell>
  );
}

/** /teaching/checking */
export default function TeachingCheckingPage() {
  return <Page<Data> endpoint={'/teaching/checking'} render={(d) => <View {...d} />} />;
}
