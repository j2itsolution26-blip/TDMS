import { useState } from 'react';
import Link from '@/lib/link';
import { Download, Printer } from 'lucide-react';
import { Page } from '@/lib/page-data';
import { useRouter } from '@/lib/navigation';
import { BTN, BTN_SECONDARY, Card, Empty, Flash, INPUT, LABEL, PageShell, TD, TH, Table } from '@/components/teaching/kit';
import { ResultChip, TotalsCards, rate, withQuery } from '@/components/assessment/parts';
import type { loadAssessmentReports } from '@/server/controllers/pages/app/assessment';

type Data = Awaited<ReturnType<typeof loadAssessmentReports>>;

const KEYS = ['programId', 'batchId', 'assessor', 'from', 'to'] as const;

function Filters({ d }: { d: Data }) {
  const router = useRouter();
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(KEYS.map((k) => [k, (d.query as Record<string, string>)[k] ?? ''])));
  const batches = f.programId ? d.batches.filter((b) => b.programId === f.programId) : d.batches;
  return (
    <Card>
      <form className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); router.push(withQuery('/assessment/reports', f)); }} aria-label="Report filters">
        <div className="lg:col-span-2">
          <label htmlFor="r-program" className={LABEL}>Qualification</label>
          <select id="r-program" className={INPUT} value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value, batchId: '' })}>
            <option value="">All qualifications</option>
            {d.qualifications.map((q) => <option key={q.id} value={q.id}>{q.code} — {q.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="r-batch" className={LABEL}>Batch</label>
          <select id="r-batch" className={INPUT} value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })}>
            <option value="">All batches</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.batchNumber}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="r-assessor" className={LABEL}>Assessor</label>
          <input id="r-assessor" className={INPUT} value={f.assessor} onChange={(e) => setF({ ...f, assessor: e.target.value })} placeholder="Any" />
        </div>
        <div>
          <label htmlFor="r-from" className={LABEL}>From</label>
          <input id="r-from" type="date" className={INPUT} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        </div>
        <div>
          <label htmlFor="r-to" className={LABEL}>To</label>
          <input id="r-to" type="date" className={INPUT} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </div>
        <div className="flex items-end gap-2 lg:col-span-6">
          <button type="submit" className={BTN}>Update report</button>
          <Link href="/assessment/reports" className={BTN_SECONDARY}>Clear</Link>
        </div>
      </form>
    </Card>
  );
}

function View(d: Data) {
  const { report } = d;
  const query = d.query as Record<string, string>;
  return (
    <PageShell
      eyebrow="Assessment Center"
      title="Batch Result Reports"
      description="Results per batch with competency totals. Print for signature, or export to CSV. Each print and export is recorded in the audit log."
      actions={
        <>
          <a href={withQuery('/assessment/reports/print', query)} target="_blank" rel="noopener" className={BTN_SECONDARY}><Printer className="h-4 w-4" aria-hidden="true" /> Printable report</a>
          <a href={withQuery('/api/v1/assessment/reports/export', query)} className={BTN}><Download className="h-4 w-4" aria-hidden="true" /> Export CSV</a>
        </>
      }
    >
      <Filters key={JSON.stringify(query)} d={d} />
      {report.truncated && <Flash kind="info">Showing the first 200 batches. Narrow the filters to report on the rest.</Flash>}
      <TotalsCards totals={report.totals} batches={report.batches.length} />

      {report.batches.length === 0 ? (
        <Card><div className="py-6"><Empty title="No batches match these filters" /></div></Card>
      ) : (
        report.batches.map((b) => (
          <Card key={b.batchId} title={`Batch ${b.batchNumber}`} description={`${b.qualification.code} — ${b.qualification.name} · ${b.assessmentDate} · Assessor: ${b.assessorName}${b.status === 'OPEN' ? ' · Not yet finalized' : ''}`} padded={false}>
            {b.rows.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-tdms-muted">No candidates.</p>
            ) : (
              <Table label={`Batch ${b.batchNumber} results`} head={<><th className={TH}>Candidate ID</th><th className={TH}>Full name</th><th className={TH}>Assessor</th><th className={TH}>Result</th><th className={TH}>Attempt</th></>}>
                {b.rows.map((r) => (
                  <tr key={r.candidateId}>
                    <td className={`${TD} tabular-nums`}>{r.candidateId}</td>
                    <td className={TD}>{r.name}</td>
                    <td className={TD}>{r.assessorName}</td>
                    <td className={TD}><ResultChip official={r.result} /></td>
                    <td className={`${TD} tabular-nums`}>{r.attempt}</td>
                  </tr>
                ))}
              </Table>
            )}
            <p className="border-t border-tdms-hairline px-6 py-3 text-[13px] text-tdms-muted">
              Assessed (finalized): <b className="text-tdms-ink">{b.totals.assessed}</b> · Competent: <b className="text-tdms-ink">{b.totals.competent}</b> · Not Yet Competent: <b className="text-tdms-ink">{b.totals.notYetCompetent}</b> · Pending: <b className="text-tdms-ink">{b.totals.pending}</b> · Competency rate: <b className="text-tdms-ink">{rate(b.totals)}</b>
            </p>
          </Card>
        ))
      )}
    </PageShell>
  );
}

/** /assessment/reports */
export default function AssessmentReportsPage() {
  return <Page<Data> endpoint="/assessment/reports" render={(d) => <View {...d} />} />;
}
