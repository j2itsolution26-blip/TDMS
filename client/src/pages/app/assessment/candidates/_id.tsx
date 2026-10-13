import { useParams } from 'react-router-dom';
import Link from '@/lib/link';
import { Page } from '@/lib/page-data';
import { Card, Empty, FOCUS, PageShell, TD, TH, Table } from '@/components/teaching/kit';
import { BatchStatusChip, ResultChip, ResultStatusChip } from '@/components/assessment/parts';
import type { loadAssessmentCandidate } from '@/server/controllers/pages/app/assessment';

type Data = Awaited<ReturnType<typeof loadAssessmentCandidate>>;

function View({ candidate, history }: Data) {
  const latest = [...history].reverse().find((h) => h.status === 'FINALIZED');
  return (
    <PageShell
      eyebrow="Candidate history"
      title={candidate.name}
      back={{ href: '/assessment/results', label: 'Assessment Results' }}
      description={<>Candidate ID {candidate.candidateId} · {candidate.program}</>}
      actions={latest && <ResultChip official={latest.official} />}
    >
      <Card title="Every attempt" description="Oldest first. Finalized results are never changed; a reassessment is a new attempt linked to the one before it." padded={false}>
        {history.length === 0 ? (
          <div className="p-6"><Empty title="Not yet assessed" /></div>
        ) : (
          <Table label="Assessment history" head={<><th className={TH}>Date</th><th className={TH}>Batch</th><th className={TH}>Qualification</th><th className={TH}>Assessor</th><th className={TH}>Attempt</th><th className={TH}>Result</th><th className={TH}>Status</th><th className={TH}>Notes</th></>}>
            {history.map((h) => (
              <tr key={h.id} className={h.status === 'CANCELLED' ? 'opacity-60' : undefined}>
                <td className={`${TD} tabular-nums`}>{h.assessmentDate}</td>
                <td className={TD}>
                  <Link href={`/assessment/batches/${h.batchId}`} className={`font-semibold text-tdms-text hover:underline ${FOCUS}`}>{h.batchNumber}</Link>
                  {h.batchStatus !== 'OPEN' && <span className="ml-2"><BatchStatusChip status={h.batchStatus} /></span>}
                </td>
                <td className={TD}>{h.qualification}</td>
                <td className={TD}>{h.assessorName}</td>
                <td className={`${TD} tabular-nums`}>{h.attempt}{h.previousResultId ? ' (reassessment)' : ''}</td>
                <td className={TD}><ResultChip official={h.official} /></td>
                <td className={TD}><ResultStatusChip status={h.status} /></td>
                <td className={`${TD} max-w-[18rem] text-[13px] text-tdms-muted`}>{h.status === 'CANCELLED' ? h.cancelReason : h.remarks}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </PageShell>
  );
}

/** /assessment/candidates/:id */
export default function AssessmentCandidatePage() {
  const { id } = useParams() as { id: string };
  return <Page<Data> endpoint={`/assessment/candidates/${id}`} render={(d) => <View {...d} />} />;
}
