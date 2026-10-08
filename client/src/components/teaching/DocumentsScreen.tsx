import { useState } from 'react';
import { FileUp, Plus } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { DOCUMENT_KIND_LABELS, UPLOAD_ACCEPT, UPLOAD_MAX_BYTES, documentEditable, type DocumentKind } from '@shared/lib/teaching';
import type { DocumentView } from '@/server/services/teaching/documents';
import { sendForm, useAction } from './client-kit';
import { BTN, BTN_SECONDARY, BTN_SMALL, Card, Chip, Empty, FOCUS, Field, Flash, INPUT, TD, TH, Table } from './kit';

/** The fields each kind of document carries, beyond its class, title, date and file. */
export const DOC_FIELDS: Record<DocumentKind, { key: string; label: string; long?: boolean }[]> = {
  LESSON_PLAN: [{ key: 'topic', label: 'Lesson topic' }, { key: 'objectives', label: 'Objectives', long: true }],
  TOS: [{ key: 'assessment', label: 'Assessment' }, { key: 'coverage', label: 'Coverage', long: true }, { key: 'totalItems', label: 'Total items' }],
  PT: [{ key: 'description', label: 'Description', long: true }, { key: 'criteria', label: 'Criteria', long: true }, { key: 'rubric', label: 'Rubric', long: true }],
};

const TITLE_LABEL: Record<DocumentKind, string> = { LESSON_PLAN: 'Title', TOS: 'Title', PT: 'Task' };

export function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function DocumentsScreen({ kind, rows, classes, archived }: { kind: DocumentKind; rows: DocumentView[]; classes: { id: string; label: string }[]; archived: boolean }) {
  const [editing, setEditing] = useState<DocumentView | 'new' | null>(null);
  const act = useAction();
  const label = DOCUMENT_KIND_LABELS[kind];

  async function submit(d: DocumentView) {
    if (!window.confirm(`Submit “${d.title}” for review? The TVET Director and Coordinator will be notified, and you cannot edit it unless it is returned.`)) return;
    await act.run(() => api.post(`/api/v1/documents/${d.id}/submit`), { success: 'Submitted for review.' });
  }
  async function remove(d: DocumentView) {
    if (!window.confirm(`Delete the draft “${d.title}”?`)) return;
    await act.run(() => api.del(`/api/v1/documents/${d.id}`), { success: 'Draft deleted.' });
  }

  return (
    <>
      <Card
        padded={false}
        title={`${rows.length} ${rows.length === 1 ? 'document' : 'documents'}`}
        description="Draft → Submitted → Under Review → Approved or Returned"
        actions={!archived && classes.length > 0 ? <button type="button" className={BTN} onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" /> New {label}</button> : null}
      >
        <div className="space-y-2 px-5 pb-3 sm:px-6">
          {act.notice && <Flash kind="success">{act.notice}</Flash>}
          {act.error && <Flash kind="error">{act.error}</Flash>}
        </div>
        {rows.length === 0 ? (
          <div className="px-5 pb-5 sm:px-6"><Empty title={`No ${label.toLowerCase()} documents yet`} description={`Create a ${label.toLowerCase()}, attach the file, and submit it for review.`} /></div>
        ) : (
          <Table
            label={label}
            head={
              <>
                <th scope="col" className={TH}>{TITLE_LABEL[kind]}</th>
                <th scope="col" className={TH}>Subject</th>
                <th scope="col" className={TH}>Date</th>
                <th scope="col" className={TH}>File</th>
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
              </>
            }
          >
            {rows.map((d) => {
              const editable = documentEditable(d.status) && !d.archived;
              return (
                <tr key={d.id}>
                  <td className={TD}>
                    <span className="block font-semibold">{d.title}</span>
                    {d.details.topic && <span className="block text-xs text-tdms-muted">Topic: {d.details.topic}</span>}
                    {d.details.assessment && <span className="block text-xs text-tdms-muted">For: {d.details.assessment}</span>}
                  </td>
                  <td className={TD}>{d.subject}<span className="block text-xs text-tdms-muted">{d.classDetail}</span></td>
                  <td className={`${TD} whitespace-nowrap tabular-nums text-[13px]`}>{d.documentDate ?? '—'}</td>
                  <td className={`${TD} text-[13px]`}>
                    {d.file ? (
                      <a href={`/api/v1/documents/${d.id}/file`} className={`rounded font-semibold text-tdms-text hover:underline ${FOCUS}`}>
                        {d.file.name}
                        <span className="block text-xs font-normal text-tdms-muted">{formatSize(d.file.size)}</span>
                      </a>
                    ) : (
                      <span className="text-tdms-muted">No file</span>
                    )}
                  </td>
                  <td className={TD}>
                    <Chip status={d.status} label={d.statusLabel} />
                    {d.reviewNote && d.status === 'RETURNED' && <span className="mt-1 block max-w-[16rem] text-xs text-red-700">{d.reviewedBy}: {d.reviewNote}</span>}
                    {d.reviewNote && d.status === 'APPROVED' && <span className="mt-1 block max-w-[16rem] text-xs text-tdms-muted">{d.reviewNote}</span>}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    <div className="flex justify-end gap-1.5">
                      {editable && <button type="button" className={BTN_SMALL} onClick={() => setEditing(d)}>Edit</button>}
                      {editable && <button type="button" className={BTN_SMALL} disabled={act.busy || !d.file} title={d.file ? undefined : 'Attach a file first'} onClick={() => submit(d)}>Submit</button>}
                      {d.status === 'DRAFT' && !d.archived && <button type="button" className={BTN_SMALL} disabled={act.busy} onClick={() => remove(d)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? `New ${label}` : `Edit ${label}`} maxWidth="sm:max-w-2xl">
        {editing !== null && <DocumentForm kind={kind} classes={classes} doc={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function DocumentForm({ kind, classes, doc, onDone }: { kind: DocumentKind; classes: { id: string; label: string }[]; doc: DocumentView | null; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [classId, setClassId] = useState(doc?.classId ?? classes[0]?.id ?? '');
  const [title, setTitle] = useState(doc?.title ?? '');
  const [documentDate, setDate] = useState(doc?.documentDate ?? '');
  const [details, setDetails] = useState<Record<string, string>>(doc?.details ?? {});
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const form = new FormData();
    form.set('data', JSON.stringify({ kind, classId, title, documentDate: documentDate || null, details }));
    if (file) form.set('file', file);
    const ok = await run(() => sendForm(doc ? 'PUT' : 'POST', doc ? `/api/v1/documents/${doc.id}` : '/api/v1/documents', form));
    if (ok) onDone();
  }

  return (
    <form className="space-y-4" onSubmit={save}>
      <Field label="Subject / class" htmlFor="d-class" error={errors.classId} hint="Program, year level and section come from the class.">
        <select id="d-class" className={INPUT} value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={TITLE_LABEL[kind]} htmlFor="d-title" error={errors.title} className="sm:col-span-2">
          <input id="d-title" className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={255} />
        </Field>
        <Field label="Date" htmlFor="d-date" error={errors.documentDate}>
          <input id="d-date" type="date" className={INPUT} value={documentDate} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {DOC_FIELDS[kind].map((f) => (
        <Field key={f.key} label={f.label} htmlFor={`d-${f.key}`}>
          {f.long ? (
            <textarea id={`d-${f.key}`} rows={3} className={INPUT} value={details[f.key] ?? ''} onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })} maxLength={5000} />
          ) : (
            <input id={`d-${f.key}`} className={INPUT} value={details[f.key] ?? ''} onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })} maxLength={500} />
          )}
        </Field>
      ))}
      <Field label={doc?.file ? `Replace file (current: ${doc.file.name})` : 'File'} htmlFor="d-file" error={errors.file ?? fileError ?? undefined} hint="PDF, Word, Excel, PowerPoint, JPG or PNG — up to 4 MB.">
        <label htmlFor="d-file" className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-tdms-hairline px-4 py-3 text-sm hover:bg-tdms-bg ${FOCUS}`}>
          <FileUp className="h-5 w-5 text-tdms-text" aria-hidden="true" />
          <span className="min-w-0 truncate">{file ? `${file.name} (${formatSize(file.size)})` : 'Choose a file…'}</span>
        </label>
        <input
          id="d-file"
          type="file"
          className="sr-only"
          accept={UPLOAD_ACCEPT}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFileError(f && f.size > UPLOAD_MAX_BYTES ? 'The file is larger than 4 MB.' : null);
            setFile(f && f.size <= UPLOAD_MAX_BYTES ? f : null);
          }}
        />
      </Field>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button>
        <button type="submit" className={BTN} disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</button>
      </div>
    </form>
  );
}
