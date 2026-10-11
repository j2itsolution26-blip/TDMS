import { useState } from 'react';
import { useParams } from 'react-router-dom';
import Link from '@/lib/link';
import { CheckCircle2, Pencil, Search, UserPlus, XCircle } from 'lucide-react';
import Modal from '@/components/Modal';
import { Page } from '@/lib/page-data';
import { api } from '@/lib/api-client';
import { useAction } from '@/components/teaching/client-kit';
import { BTN, BTN_DANGER, BTN_SECONDARY, BTN_SMALL, Card, Empty, Field, Flash, FOCUS, INPUT, PageShell, TD, TH, Table } from '@/components/teaching/kit';
import { BatchForm, BatchStatusChip, ResultChip, ResultStatusChip, TotalsCards } from '@/components/assessment/parts';
import type { loadAssessmentBatch } from '@/server/controllers/pages/app/assessment';

type Data = Awaited<ReturnType<typeof loadAssessmentBatch>>;
type Row = Data['results'][number];

function Enrol({ batchId, programId, onDone }: { batchId: string; programId: string; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; candidateId: string; name: string; yearLevel: number }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [outcome, setOutcome] = useState<{ added: number; refused: { candidateId: string; name: string; reason: string }[] } | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const rows = await run(() => api.get<NonNullable<typeof found>>(`/api/v1/assessment/candidates?programId=${programId}&q=${encodeURIComponent(q)}`), { refresh: false });
    if (rows) setFound(rows);
  }
  async function add() {
    const result = await run(() => api.post<NonNullable<typeof outcome>>(`/api/v1/assessment/batches/${batchId}/candidates`, { studentIds: [...picked] }));
    if (result) { setOutcome(result); setPicked(new Set()); }
  }
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={search}>
        <label htmlFor="enrol-q" className="sr-only">Search students</label>
        <input id="enrol-q" className={INPUT} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or student number — leave blank to list all" />
        <button type="submit" className={BTN_SECONDARY} disabled={busy}><Search className="h-4 w-4" aria-hidden="true" /> Search</button>
      </form>
      <p className="text-xs text-tdms-muted">Only students of this batch's qualification are listed. A candidate already Competent, or already in a batch, is refused with the reason.</p>
      {found && (found.length === 0 ? (
        <p className="text-sm text-tdms-muted">No matching students.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-tdms-hairline overflow-y-auto rounded-xl border border-tdms-hairline">
          {found.map((s) => (
            <li key={s.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-tdms-bg">
                <input type="checkbox" className="rounded border-tdms-hairline text-tdms-text focus:ring-tdms-text" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                <span className="tabular-nums text-tdms-muted">{s.candidateId}</span>
                <span className="font-semibold text-tdms-ink">{s.name}</span>
                <span className="ml-auto text-xs text-tdms-muted">Year {s.yearLevel}</span>
              </label>
            </li>
          ))}
        </ul>
      ))}
      {outcome && (
        <Flash kind={outcome.refused.length ? 'info' : 'success'}>
          <p>{outcome.added} candidate{outcome.added === 1 ? '' : 's'} added.</p>
          {outcome.refused.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {outcome.refused.map((r) => <li key={r.candidateId}>{r.candidateId} {r.name}: {r.reason}</li>)}
            </ul>
          )}
        </Flash>
      )}
      {error && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onDone}>Close</button>
        <button type="button" className={BTN} disabled={busy || picked.size === 0} onClick={add}><UserPlus className="h-4 w-4" aria-hidden="true" /> Add {picked.size || ''} to batch</button>
      </div>
    </div>
  );
}

function RecordForm({ row, onDone }: { row: Row; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [result, setResult] = useState<'C' | 'NYC' | ''>((row.recorded as 'C' | 'NYC' | null) ?? '');
  const [remarks, setRemarks] = useState(row.remarks ?? '');
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (await run(() => api.put(`/api/v1/assessment/results/${row.id}`, { result, remarks: remarks || null }))) onDone();
  }
  return (
    <form className="space-y-4" onSubmit={save}>
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-tdms-ink">Result</legend>
        <div className="flex gap-3">
          {(['C', 'NYC'] as const).map((v) => (
            <label key={v} className={`flex flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${result === v ? 'border-tdms-text bg-emerald-50 text-tdms-text' : 'border-tdms-hairline'}`}>
              <input type="radio" name="result" value={v} checked={result === v} onChange={() => setResult(v)} className="text-tdms-text focus:ring-tdms-text" />
              {v === 'C' ? 'Competent (C)' : 'Not Yet Competent (NYC)'}
            </label>
          ))}
        </div>
        {errors.result?.map((m) => <p key={m} className="mt-1 text-xs font-medium text-red-700">{m}</p>)}
      </fieldset>
      <Field label="Remarks (optional)" htmlFor="r-remarks" error={errors.remarks}>
        <textarea id="r-remarks" rows={2} className={INPUT} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} />
      </Field>
      <p className="text-xs text-tdms-muted">Saved as a draft — reported as Pending until the result or the batch is finalized.</p>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button>
        <button type="submit" className={BTN} disabled={busy || !result}>Save draft</button>
      </div>
    </form>
  );
}

function ReasonForm({ url, label, onDone }: { url: string; label: string; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [reason, setReason] = useState('');
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post(url, { reason }))) onDone(); }}>
      <Field label="Reason" htmlFor="reason" error={errors.reason}>
        <textarea id="reason" rows={3} className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={500} />
      </Field>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onDone}>Back</button>
        <button type="submit" className={BTN_DANGER} disabled={busy || !reason.trim()}>{label}</button>
      </div>
    </form>
  );
}

function ReassessForm({ row, targets, onDone }: { row: Row; targets: Data['reassessTargets']; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [target, setTarget] = useState(targets[0]?.id ?? '');
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post(`/api/v1/assessment/results/${row.id}/reassess`, { targetBatchId: target }))) onDone(); }}>
      <p className="text-sm">{row.name} was assessed Not Yet Competent (attempt {row.attempt}). That result stays on record; the reassessment is a new attempt, linked to it.</p>
      {targets.length === 0 ? (
        <Flash kind="info">There is no other open batch for this qualification. Create one first, then reassess.</Flash>
      ) : (
        <Field label="Reassess in batch" htmlFor="re-target" error={errors.targetBatchId}>
          <select id="re-target" className={INPUT} value={target} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((b) => <option key={b.id} value={b.id}>{b.batchNumber} · {b.assessmentDate}</option>)}
          </select>
        </Field>
      )}
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button>
        <button type="submit" className={BTN} disabled={busy || !target}>Create reassessment</button>
      </div>
    </form>
  );
}

type Dialog =
  | { kind: 'edit' }
  | { kind: 'enrol' }
  | { kind: 'cancelBatch' }
  | { kind: 'record'; row: Row }
  | { kind: 'cancelResult'; row: Row }
  | { kind: 'reassess'; row: Row };

function View(d: Data) {
  const { batch } = d;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const { busy, error, notice, run } = useAction();
  const open = batch.status === 'OPEN';
  const manage = d.canManage && open;
  const close = () => setDialog(null);
  const live = d.results.filter((r) => r.status !== 'CANCELLED');

  async function finalizeBatch() {
    const pending = live.filter((r) => r.status === 'PENDING').length;
    if (pending > 0) { window.alert(`${pending} candidate${pending === 1 ? ' has' : 's have'} no recorded result yet.`); return; }
    if (!window.confirm(`Finalize batch ${batch.batchNumber}? Every recorded result becomes official and can no longer be changed — only a reassessment can follow a Not Yet Competent result.`)) return;
    await run(() => api.post(`/api/v1/assessment/batches/${batch.id}/finalize`), { success: 'Batch finalized.' });
  }
  async function finalizeOne(row: Row) {
    if (!window.confirm(`Finalize ${row.name}'s result? It can no longer be changed.`)) return;
    await run(() => api.post(`/api/v1/assessment/results/${row.id}/finalize`), { success: 'Result finalized.' });
  }

  return (
    <PageShell
      eyebrow="Assessment batch"
      title={batch.batchNumber}
      back={{ href: '/assessment/results', label: 'Assessment Results' }}
      description={<>{batch.program.code} — {batch.program.name} · {batch.assessmentDate} · Assessor: {batch.assessorName}{batch.venue ? ` · ${batch.venue}` : ''}</>}
      actions={
        <>
          <BatchStatusChip status={batch.status} />
          {manage && (
            <>
              <button type="button" className={BTN_SECONDARY} onClick={() => setDialog({ kind: 'edit' })}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setDialog({ kind: 'enrol' })}><UserPlus className="h-4 w-4" aria-hidden="true" /> Add candidates</button>
              <button type="button" className={BTN} disabled={busy} onClick={finalizeBatch}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Finalize batch</button>
              {!d.results.some((r) => r.status === 'FINALIZED') && <button type="button" className={BTN_DANGER} onClick={() => setDialog({ kind: 'cancelBatch' })}><XCircle className="h-4 w-4" aria-hidden="true" /> Cancel batch</button>}
            </>
          )}
        </>
      }
    >
      {batch.status === 'CANCELLED' && <Flash kind="info">This batch was cancelled{batch.cancelReason ? `: ${batch.cancelReason}` : '.'} It is kept on record and excluded from reports.</Flash>}
      {batch.status === 'FINALIZED' && <Flash kind="success">Finalized{batch.finalizedAt ? ` on ${new Date(batch.finalizedAt).toLocaleString()}` : ''}. Results are official and locked.</Flash>}
      {notice && <Flash kind="success">{notice}</Flash>}
      {error && <Flash kind="error">{error}</Flash>}
      {batch.notes && <p className="text-sm text-tdms-muted">{batch.notes}</p>}

      <TotalsCards totals={batch.totals} />

      <Card title="Candidates" description={`${live.length} enrolled${d.results.length > live.length ? `, ${d.results.length - live.length} cancelled` : ''}`} padded={false}>
        {d.results.length === 0 ? (
          <div className="p-6"><Empty title="No candidates yet" description={manage ? 'Add candidates to start recording results.' : undefined} action={manage ? <button type="button" className={BTN} onClick={() => setDialog({ kind: 'enrol' })}>Add candidates</button> : undefined} /></div>
        ) : (
          <Table label="Candidates and results" head={<><th className={TH}>Candidate ID</th><th className={TH}>Full name</th><th className={TH}>Attempt</th><th className={TH}>Recorded</th><th className={TH}>Official result</th><th className={TH}>Status</th><th className={TH}>Remarks</th><th className={`${TH} text-right`}>Actions</th></>}>
            {d.results.map((r) => (
              <tr key={r.id} className={r.status === 'CANCELLED' ? 'opacity-60' : 'hover:bg-tdms-bg/40'}>
                <td className={`${TD} tabular-nums`}>{r.candidateId}</td>
                <td className={TD}>
                  <Link href={`/assessment/candidates/${r.studentId}`} className={`font-semibold text-tdms-ink hover:text-tdms-text hover:underline ${FOCUS}`}>{r.name}</Link>
                  {r.previous && <p className="text-xs text-tdms-muted">Reassessment of attempt {r.previous.attempt} (<Link href={`/assessment/batches/${r.previous.batchId}`} className="underline">{r.previous.batchNumber}</Link>)</p>}
                  {r.reassessment && <p className="text-xs text-tdms-muted">Reassessed in <Link href={`/assessment/batches/${r.reassessment.batchId}`} className="underline">{r.reassessment.batchNumber}</Link></p>}
                </td>
                <td className={`${TD} tabular-nums`}>{r.attempt}</td>
                <td className={TD}>{r.recorded ?? '—'}</td>
                <td className={TD}><ResultChip official={r.official} /></td>
                <td className={TD}><ResultStatusChip status={r.status} /></td>
                <td className={`${TD} max-w-[16rem] text-[13px] text-tdms-muted`}>{r.status === 'CANCELLED' ? r.cancelReason : r.remarks}</td>
                <td className={`${TD} text-right`}>
                  <div className="flex justify-end gap-1.5">
                    {manage && (r.status === 'PENDING' || r.status === 'DRAFT') && (
                      <>
                        <button type="button" className={BTN_SMALL} onClick={() => setDialog({ kind: 'record', row: r })}>{r.status === 'DRAFT' ? 'Change' : 'Record'}</button>
                        {r.status === 'DRAFT' && <button type="button" className={BTN_SMALL} disabled={busy} onClick={() => finalizeOne(r)}>Finalize</button>}
                        <button type="button" className={BTN_SMALL} onClick={() => setDialog({ kind: 'cancelResult', row: r })}>Withdraw</button>
                      </>
                    )}
                    {d.canManage && r.status === 'FINALIZED' && r.recorded === 'NYC' && !r.reassessment && (
                      <button type="button" className={BTN_SMALL} onClick={() => setDialog({ kind: 'reassess', row: r })}>Reassess</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={dialog?.kind === 'edit'} onClose={close} title="Edit batch">
        {dialog?.kind === 'edit' && (
          <BatchForm
            value={{ id: batch.id, batchNumber: batch.batchNumber, programId: batch.program.id, assessmentDate: batch.assessmentDate, venue: batch.venue, assessorUserId: batch.assessorUserId, assessorName: batch.assessorName, notes: batch.notes, locked: live.length > 0 }}
            qualifications={d.qualifications}
            assessors={d.assessors}
            today={batch.assessmentDate}
            onDone={close}
          />
        )}
      </Modal>
      <Modal open={dialog?.kind === 'enrol'} onClose={close} title="Add candidates" subtitle={`${batch.program.code} — ${batch.program.name}`}>
        {dialog?.kind === 'enrol' && <Enrol batchId={batch.id} programId={batch.program.id} onDone={close} />}
      </Modal>
      <Modal open={dialog?.kind === 'record'} onClose={close} title="Record result" subtitle={dialog?.kind === 'record' ? `${dialog.row.candidateId} · ${dialog.row.name}` : undefined}>
        {dialog?.kind === 'record' && <RecordForm row={dialog.row} onDone={close} />}
      </Modal>
      <Modal open={dialog?.kind === 'cancelResult'} onClose={close} title="Withdraw candidate" subtitle="The row is kept on record as cancelled and is not counted.">
        {dialog?.kind === 'cancelResult' && <ReasonForm url={`/api/v1/assessment/results/${dialog.row.id}/cancel`} label="Withdraw" onDone={close} />}
      </Modal>
      <Modal open={dialog?.kind === 'cancelBatch'} onClose={close} title={`Cancel batch ${batch.batchNumber}`} subtitle="Its unfinished results are cancelled with it. The batch stays on record.">
        {dialog?.kind === 'cancelBatch' && <ReasonForm url={`/api/v1/assessment/batches/${batch.id}/cancel`} label="Cancel batch" onDone={close} />}
      </Modal>
      <Modal open={dialog?.kind === 'reassess'} onClose={close} title="Reassess candidate">
        {dialog?.kind === 'reassess' && <ReassessForm row={dialog.row} targets={d.reassessTargets} onDone={close} />}
      </Modal>
    </PageShell>
  );
}

/** /assessment/batches/:id */
export default function AssessmentBatchPage() {
  const { id } = useParams() as { id: string };
  return <Page<Data> endpoint={`/assessment/batches/${id}`} render={(d) => <View {...d} />} />;
}
