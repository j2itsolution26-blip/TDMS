'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, DOCUMENT_STATUSES, DOCUMENT_STATUS_LABELS } from '@/lib/teaching';
import type { DocumentView } from '@/server/services/teaching/documents';
import { DOC_FIELDS, formatSize } from './DocumentsScreen';
import { useAction } from './client-kit';
import { BTN, BTN_DANGER, BTN_SECONDARY, BTN_SMALL, Card, Chip, Empty, FOCUS, Field, Flash, INPUT, TD, TH, Table } from './kit';

/** Lesson plans, TOS and PT submitted by Diploma Instructors, for the Director and Coordinator. */
export default function ReviewQueue({ rows, canReview, kind, status }: { rows: DocumentView[]; canReview: boolean; kind: string; status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState<DocumentView | null>(null);
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <Card padded={false} title={`${rows.length} ${rows.length === 1 ? 'document' : 'documents'}`}>
      <div className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-2 sm:px-6">
        <label><span className="sr-only">Type</span>
          <select className={INPUT} value={kind} onChange={(e) => setParam('kind', e.target.value)}>
            <option value="">All types</option>
            {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{DOCUMENT_KIND_LABELS[k]}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Status</span>
          <select className={INPUT} value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">All submitted</option>
            {DOCUMENT_STATUSES.filter((s) => s !== 'DRAFT').map((s) => <option key={s} value={s}>{DOCUMENT_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 pb-5 sm:px-6"><Empty title="Nothing here" description="Documents appear once a Diploma Instructor submits them." /></div>
      ) : (
        <Table label="Academic documents" head={<><th scope="col" className={TH}>Document</th><th scope="col" className={TH}>Instructor</th><th scope="col" className={TH}>Subject</th><th scope="col" className={TH}>Submitted</th><th scope="col" className={TH}>Status</th><th scope="col" className={TH}><span className="sr-only">Open</span></th></>}>
          {rows.map((d) => (
            <tr key={d.id}>
              <td className={TD}><span className="block font-semibold">{d.title}</span><span className="text-xs text-tdms-muted">{d.kindLabel}</span></td>
              <td className={TD}>{d.instructor ?? '—'}</td>
              <td className={TD}>{d.subject}<span className="block text-xs text-tdms-muted">{d.classDetail} · {d.schoolYear}</span></td>
              <td className={`${TD} whitespace-nowrap text-[13px] tabular-nums`}>{d.submittedAt?.slice(0, 10) ?? '—'}</td>
              <td className={TD}><Chip status={d.status} label={d.statusLabel} /></td>
              <td className={`${TD} text-right`}><button type="button" className={BTN_SMALL} onClick={() => setOpen(d)}>{canReview && ['SUBMITTED', 'UNDER_REVIEW'].includes(d.status) ? 'Review' : 'View'}</button></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open !== null} onClose={() => setOpen(null)} title={open ? `${open.kindLabel}: ${open.title}` : ''} maxWidth="sm:max-w-2xl">
        {open && <ReviewPanel doc={open} canReview={canReview} onDone={() => setOpen(null)} />}
      </Modal>
    </Card>
  );
}

function ReviewPanel({ doc, canReview, onDone }: { doc: DocumentView; canReview: boolean; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [note, setNote] = useState('');
  const reviewable = canReview && ['SUBMITTED', 'UNDER_REVIEW'].includes(doc.status) && !doc.archived;
  const decide = async (action: 'start' | 'approve' | 'return') => {
    const ok = await run(() => api.post(`/api/documents/${doc.id}/review`, { action, note: note || null }));
    if (ok && action !== 'start') onDone();
  };

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-tdms-muted">Instructor</dt><dd className="font-semibold">{doc.instructor ?? '—'}</dd></div>
        <div><dt className="text-xs text-tdms-muted">Status</dt><dd><Chip status={doc.status} label={doc.statusLabel} /></dd></div>
        <div><dt className="text-xs text-tdms-muted">Subject</dt><dd>{doc.subject}</dd></div>
        <div><dt className="text-xs text-tdms-muted">Program · Year · Section</dt><dd>{doc.classDetail}</dd></div>
        <div><dt className="text-xs text-tdms-muted">School year · Semester</dt><dd>{doc.schoolYear} · {doc.semester}</dd></div>
        <div><dt className="text-xs text-tdms-muted">Date</dt><dd>{doc.documentDate ?? '—'}</dd></div>
        {DOC_FIELDS[doc.kind].map((f) => doc.details[f.key] ? (
          <div key={f.key} className={f.long ? 'col-span-2' : ''}><dt className="text-xs text-tdms-muted">{f.label}</dt><dd className="whitespace-pre-line">{doc.details[f.key]}</dd></div>
        ) : null)}
      </dl>
      {doc.file && (
        <p className="flex flex-wrap gap-3 text-sm">
          <a href={`/api/documents/${doc.id}/file?inline=1`} target="_blank" rel="noopener" className={`rounded font-semibold text-tdms-text hover:underline ${FOCUS}`}>View {doc.file.name}</a>
          <a href={`/api/documents/${doc.id}/file`} className={`rounded font-semibold text-tdms-text hover:underline ${FOCUS}`}>Download ({formatSize(doc.file.size)})</a>
        </p>
      )}
      {doc.reviewNote && <p className="rounded-xl bg-tdms-bg p-3 text-sm"><span className="font-semibold">{doc.reviewedBy ?? 'Reviewer'}:</span> {doc.reviewNote}</p>}
      {reviewable && (
        <>
          <Field label="Feedback to the instructor" htmlFor="rv-note" error={errors.note} hint="Required when returning.">
            <textarea id="rv-note" rows={3} className={INPUT} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </Field>
          {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
          <div className="flex flex-wrap justify-end gap-2">
            {doc.status === 'SUBMITTED' && <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => decide('start')}>Mark under review</button>}
            <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => decide('return')}>Return</button>
            <button type="button" className={BTN} disabled={busy} onClick={() => decide('approve')}>Approve</button>
          </div>
        </>
      )}
    </div>
  );
}
