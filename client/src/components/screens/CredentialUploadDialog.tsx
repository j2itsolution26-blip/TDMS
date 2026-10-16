import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { FileUp, FileText, UploadCloud, X } from 'lucide-react';
import Modal from '@/components/Modal';
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/ui';
import {
  CREDENTIAL_UPLOAD_ACCEPT, CREDENTIAL_UPLOAD_LABEL, CREDENTIAL_UPLOAD_MAX_LABEL, CREDENTIAL_UPLOAD_TYPES, fileTypeLabel, formatBytes, precheckCredentialFile,
} from '@shared/lib/credential-files';

/**
 * Upload (or replace) the soft copy of one credential.
 *
 * Drag a file onto the area or browse for one; the dialog checks its type and
 * size at once (the server checks again, and the content too), shows the
 * upload's progress, and keeps the dialog open with the server's message if it
 * is refused. The record changes only once the server has stored the file, so
 * cancelling or a failure leaves the existing document as it was.
 *
 * XMLHttpRequest rather than fetch: it reports upload progress.
 */

export interface UploadTarget {
  credentialId: string;
  requirement: string;
  /** The document already on record, when this is a replacement. */
  current: string | null;
  /** The document being replaced was verified: the new one goes back to review. */
  wasVerified?: boolean;
}

/** The type the file will be stored as, from its extension (the server confirms it from the content). */
function typeOf(name: string): string | null {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return fileTypeLabel(CREDENTIAL_UPLOAD_TYPES[ext]);
}

export default function CredentialUploadDialog({
  target,
  student,
  onClose,
  onUploaded,
}: {
  target: UploadTarget | null;
  student: { fullName: string; studentNumber: string };
  onClose: () => void;
  onUploaded: (message: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const browse = useRef<HTMLButtonElement>(null);
  const request = useRef<XMLHttpRequest | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const open = target !== null;
  const busy = progress !== null;

  // Each opening starts clean; focus goes to Browse once Modal has noted the opener.
  useEffect(() => {
    if (!open) return;
    setFile(null); setError(null); setProgress(null); setDragging(false);
    browse.current?.focus();
  }, [open]);

  // Closing the dialog mid-upload abandons the request.
  useEffect(() => () => request.current?.abort(), []);

  function choose(f: File | null | undefined) {
    if (!f) return;
    setFile(f);
    setError(precheckCredentialFile(f));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!busy) choose(event.dataTransfer.files?.[0]);
  }

  function upload() {
    if (!target || !file || busy) return;
    const problem = precheckCredentialFile(file);
    if (problem) { setError(problem); return; }
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    request.current = xhr;
    xhr.open('POST', `/api/v1/credentials/${target.credentialId}/file`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => { setProgress(null); setError('The upload did not reach the server. Check the connection and try again.'); };
    xhr.onabort = () => setProgress(null);
    xhr.onload = () => {
      request.current = null;
      let body: { success?: boolean; message?: string; errors?: Record<string, string[]> } | null = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        setProgress(100);
        onUploaded(`${target.requirement}: ${file.name} uploaded. It is Pending Review${target.wasVerified ? ' and must be verified again' : ''}.`);
        return;
      }
      setProgress(null);
      setError(body?.errors?.file?.[0] ?? body?.message ?? 'The document could not be uploaded. Try again.');
    };
    setError(null);
    setProgress(0);
    xhr.send(form);
  }

  const invalid = Boolean(error) && !busy;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={target?.current ? 'Replace Document' : 'Upload Document'}
      subtitle={`${student.fullName} · ${student.studentNumber}`}
      appearance="fluent"
      maxWidth="sm:max-w-lg"
      trapFocus
      animate
      icon={<FileUp className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" className={BUTTON_SECONDARY} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={BUTTON_PRIMARY} onClick={upload} disabled={!file || busy || Boolean(error)}>
            {busy ? `Uploading… ${progress}%` : 'Upload Document'}
          </button>
        </div>
      }
    >
      {target && (
        <div className="space-y-4">
          <div className="rounded-lg border border-tdms-hairline bg-tdms-bg px-3.5 py-2.5 text-sm">
            <p className="text-xs font-semibold text-tdms-muted">Credential</p>
            <p className="font-semibold text-tdms-ink">{target.requirement}</p>
            {target.current && <p className="mt-0.5 text-xs text-tdms-muted">Replaces {target.current}. The new document is Pending Review; the old one is kept in the history.</p>}
            {target.wasVerified && (
              <p className="mt-1.5 text-xs font-medium text-amber-800">The current document is verified. Its replacement must be verified again before the credential counts as verified.</p>
            )}
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
              dragging ? 'border-primary-600 bg-primary-50' : invalid ? 'border-red-300 bg-red-50/40' : 'border-tdms-hairline bg-white'
            }`}
          >
            <UploadCloud className={`h-8 w-8 ${dragging ? 'text-primary-600' : 'text-tdms-muted'}`} strokeWidth={1.6} aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-tdms-ink">Drag the document here</p>
            <p className="text-xs text-tdms-muted">or</p>
            <button ref={browse} type="button" className={`${BUTTON_SECONDARY} mt-2`} onClick={() => input.current?.click()} disabled={busy}
              aria-describedby={`${id}-rules`}>
              Browse Files
            </button>
            <input
              ref={input}
              id={`${id}-file`}
              type="file"
              accept={CREDENTIAL_UPLOAD_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label={`Document for ${target.requirement}`}
              onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }}
            />
            <p id={`${id}-rules`} className="mt-3 text-xs text-tdms-muted">{CREDENTIAL_UPLOAD_LABEL}, up to {CREDENTIAL_UPLOAD_MAX_LABEL}.</p>
          </div>

          {file && (
            <div className="flex items-center gap-3 rounded-lg border border-tdms-hairline px-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tdms-wash text-primary-700">
                <FileText className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-tdms-ink" title={file.name}>{file.name}</span>
                <span className="block text-xs text-tdms-muted">{[typeOf(file.name) ?? 'Unsupported type', formatBytes(file.size)].join(' · ')}</span>
              </span>
              {!busy && (
                <button type="button" onClick={() => { setFile(null); setError(null); }} aria-label={`Remove ${file.name}`}
                  className="rounded-md p-1.5 text-tdms-muted hover:bg-tdms-bg hover:text-tdms-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">
                  <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          {busy && (
            <div>
              <div role="progressbar" aria-label="Upload progress" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100}
                className="h-2 overflow-hidden rounded-full bg-tdms-bg">
                <span className="block h-full rounded-full bg-primary-600 transition-[width]" style={{ width: `${progress ?? 0}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-tdms-muted" aria-live="polite">Uploading… {progress}%</p>
            </div>
          )}

          {error && !busy && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
