import { useState } from 'react';
import Link from '@/lib/link';
import { Plus } from 'lucide-react';
import Modal from '@/components/Modal';
import { Page } from '@/lib/page-data';
import { useRouter } from '@/lib/navigation';
import { Pagination } from '@/components/ui';
import { BTN, BTN_SECONDARY, Card, Empty, FOCUS, INPUT, LABEL, PageShell, TD, TH, Table } from '@/components/teaching/kit';
import { BatchForm, BatchStatusChip, ResultChip, ResultStatusChip, TotalsCards, rate, withQuery } from '@/components/assessment/parts';
import type { loadAssessmentResults } from '@/server/controllers/pages/app/assessment';

type Data = Awaited<ReturnType<typeof loadAssessmentResults>>;

const FILTER_KEYS = ['batchId', 'programId', 'date', 'from', 'to', 'assessor', 'candidate', 'result'] as const;

function Filters({ d }: { d: Data }) {
  const router = useRouter();
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, (d.filters as Record<string, string>)[k] ?? ''])));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const batches = f.programId ? d.batches.filter((b) => b.programId === f.programId) : d.batches;

  return (
    <Card>
      <form
        className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => { e.preventDefault(); router.push(withQuery('/assessment/results', f)); }}
        aria-label="Filter results"
      >
        <div>
          <label htmlFor="f-program" className={LABEL}>Qualification</label>
          <select id="f-program" className={INPUT} value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value, batchId: '' })}>
            <option value="">All qualifications</option>
            {d.qualifications.map((q) => <option key={q.id} value={q.id}>{q.code} — {q.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-batch" className={LABEL}>Batch</label>
          <select id="f-batch" className={INPUT} value={f.batchId} onChange={set('batchId')}>
            <option value="">All batches</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.batchNumber} · {b.assessmentDate}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-assessor" className={LABEL}>Assessor</label>
          <input id="f-assessor" className={INPUT} list="f-assessors" value={f.assessor} onChange={set('assessor')} placeholder="Any assessor" />
          <datalist id="f-assessors">{d.assessors.map((a) => <option key={a.id} value={a.name} />)}</datalist>
        </div>
        <div>
          <label htmlFor="f-result" className={LABEL}>Result</label>
          <select id="f-result" className={INPUT} value={f.result} onChange={set('result')}>
            <option value="">Any result</option>
            <option value="C">Competent (C)</option>
            <option value="NYC">Not Yet Competent (NYC)</option>
            <option value="PENDING">Pending</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-candidate" className={LABEL}>Candidate</label>
          <input id="f-candidate" className={INPUT} value={f.candidate} onChange={set('candidate')} placeholder="Name or candidate ID" />
        </div>
        <div>
          <label htmlFor="f-date" className={LABEL}>Assessment date</label>
          <input id="f-date" type="date" className={INPUT} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, from: '', to: '' })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="f-from" className={LABEL}>From</label>
            <input id="f-from" type="date" className={INPUT} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, date: '' })} />
          </div>
          <div>
            <label htmlFor="f-to" className={LABEL}>To</label>
            <input id="f-to" type="date" className={INPUT} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value, date: '' })} />
          </div>
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className={BTN}>Apply filters</button>
          <Link href="/assessment/results" className={BTN_SECONDARY}>Clear</Link>
        </div>
      </form>
    </Card>
  );
}

function View(d: Data) {
  const [creating, setCreating] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageShell
      eyebrow="Assessment Center"
      title="Assessment Results"
      description="Monitor candidates' results by batch, qualification, date, assessor and result. Totals count finalized results only."
      actions={d.canManage && <button type="button" className={BTN} onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" /> New batch</button>}
    >
      <Filters key={JSON.stringify(d.filters)} d={d} />
      <TotalsCards totals={d.overall} batches={d.summaries.length} />

      <Card title="Batch summaries" description="Each batch's finalized results. Pending candidates are listed but not counted." padded={false}>
        {d.summaries.length === 0 ? (
          <div className="p-6"><Empty title="No batches match these filters" description={d.canManage ? 'Create a batch to start recording results.' : undefined} /></div>
        ) : (
          <Table label="Batch summaries" head={<><th className={TH}>Batch</th><th className={TH}>Qualification</th><th className={TH}>Date</th><th className={TH}>Assessor</th><th className={TH}>Status</th><th className={`${TH} text-right`}>Assessed</th><th className={`${TH} text-right`}>C</th><th className={`${TH} text-right`}>NYC</th><th className={`${TH} text-right`}>Pending</th><th className={`${TH} text-right`}>Rate</th></>}>
            {d.summaries.map((b) => (
              <tr key={b.id} className="hover:bg-tdms-bg/40">
                <td className={TD}><Link href={`/assessment/batches/${b.id}`} className={`font-semibold text-tdms-text hover:underline ${FOCUS}`}>{b.batchNumber}</Link></td>
                <td className={TD}>{b.program.code}</td>
                <td className={`${TD} tabular-nums`}>{b.assessmentDate}</td>
                <td className={TD}>{b.assessorName}</td>
                <td className={TD}><BatchStatusChip status={b.status} /></td>
                <td className={`${TD} text-right tabular-nums`}>{b.totals.assessed}</td>
                <td className={`${TD} text-right tabular-nums`}>{b.totals.competent}</td>
                <td className={`${TD} text-right tabular-nums`}>{b.totals.notYetCompetent}</td>
                <td className={`${TD} text-right tabular-nums`}>{b.totals.pending}</td>
                <td className={`${TD} text-right font-semibold tabular-nums`}>{rate(b.totals)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Candidate results" description={`${d.total} ${d.total === 1 ? 'result' : 'results'}`} padded={false}>
        {d.rows.length === 0 ? (
          <div className="p-6"><Empty title="No results match these filters" /></div>
        ) : (
          <>
            <Table label="Candidate results" head={<><th className={TH}>Candidate ID</th><th className={TH}>Full name</th><th className={TH}>Batch</th><th className={TH}>Qualification</th><th className={TH}>Date</th><th className={TH}>Assessor</th><th className={TH}>Attempt</th><th className={TH}>Result</th><th className={TH}>Status</th></>}>
              {d.rows.map((r) => (
                <tr key={r.id} className="hover:bg-tdms-bg/40">
                  <td className={`${TD} tabular-nums`}>{r.candidateId}</td>
                  <td className={TD}><Link href={`/assessment/candidates/${r.studentId}`} className={`font-semibold text-tdms-ink hover:text-tdms-text hover:underline ${FOCUS}`}>{r.name}</Link></td>
                  <td className={TD}><Link href={`/assessment/batches/${r.batchId}`} className={`text-tdms-text hover:underline ${FOCUS}`}>{r.batchNumber}</Link></td>
                  <td className={TD}>{r.qualification}</td>
                  <td className={`${TD} tabular-nums`}>{r.assessmentDate}</td>
                  <td className={TD}>{r.assessorName}</td>
                  <td className={`${TD} tabular-nums`}>{r.attempt}</td>
                  <td className={TD}><ResultChip official={r.official} /></td>
                  <td className={TD}><ResultStatusChip status={r.status} /></td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} lastPage={d.lastPage} total={d.total} basePath="/assessment/results" query={d.filters as Record<string, string>} />
          </>
        )}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="New assessment batch">
        {creating && <BatchForm value={null} qualifications={d.qualifications} assessors={d.assessors} today={today} onDone={() => setCreating(false)} />}
      </Modal>
    </PageShell>
  );
}

/** /assessment/results */
export default function AssessmentResultsPage() {
  return <Page<Data> endpoint="/assessment/results" render={(d) => <View {...d} />} />;
}
