import { useId } from 'react';
import { Download, Eye, FileText, RefreshCw, Upload } from 'lucide-react';
import { formatDate } from '@shared/lib/dates';
import { formatBytes, isPreviewable } from '@shared/lib/credential-files';
import type { CredentialRow } from './EnrollmentScreen';

/**
 * One credential's row parts on the student's Enrollment page: what is on
 * record, and what can be done — Upload or Replace, Preview, Download, and
 * the existing Verify and Reject. Every action is a visible button; none is
 * tucked into a menu. Files are served only by the authorized route
 * (/api/v1/credentials/:id/file), never by a storage address.
 */

const STROKE = 1.9;
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';
const BTN = `inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
const PRIMARY = `${BTN} bg-primary-600 text-white hover:bg-primary-700`;
const SECONDARY = `${BTN} border border-[#D6E2DD] bg-white text-ink hover:bg-surface`;
/** Preview and Download: square icon buttons, named for screen readers and on hover. */
const ICON_BTN = `${SECONDARY} w-8 px-0`;

export function CredentialSummary({ c }: { c: CredentialRow }) {
  return (
    <>
      <p className="font-semibold text-navy-900">
        {c.requirement.name}
        {c.requirement.isRequired && <span className="ml-2 align-middle text-[11px] font-medium text-slate-500">Required</span>}
      </p>
      {c.hasFile && c.fileName ? (
        <p className="mt-1.5 flex min-w-0 items-start gap-1.5 text-xs text-slate-600">
          <FileText className="mt-px h-3.5 w-3.5 shrink-0 text-primary-600" strokeWidth={STROKE} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-navy-900" title={c.fileName}>{c.fileName}</span>
            <span className="block text-slate-500">
              {[c.fileSize ? formatBytes(c.fileSize) : null, c.submittedAt ? `Uploaded ${formatDate(c.submittedAt)}` : null, c.submitter ? `by ${c.submitter.name}` : null].filter(Boolean).join(' · ')}
            </span>
          </span>
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-slate-500">No document uploaded yet</p>
      )}
      {c.rejectionReason && <p className="mt-1.5 text-xs font-medium text-red-700">Rejected: {c.rejectionReason}</p>}
    </>
  );
}

export function CredentialActions({
  c, busy, canUpload, canVerify, onUpload, onVerify, onReject, align = 'end',
}: {
  c: CredentialRow;
  busy: boolean;
  canUpload: boolean;
  canVerify: boolean;
  onUpload: () => void;
  onVerify: () => void;
  onReject: () => void;
  align?: 'start' | 'end';
}) {
  const hint = useId();
  const locked = c.status === 'verified';
  const fileUrl = `/api/v1/credentials/${c.id}/file`;
  const label = c.requirement.name;
  const review = canVerify && !locked;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      {canUpload && !locked && (
        <button type="button" onClick={onUpload} disabled={busy} className={c.hasFile ? SECONDARY : PRIMARY}
          aria-label={`${c.hasFile ? 'Replace' : 'Upload'} document: ${label}`}>
          {c.hasFile
            ? <><RefreshCw className="h-3.5 w-3.5" strokeWidth={STROKE} aria-hidden="true" />Replace</>
            : <><Upload className="h-3.5 w-3.5" strokeWidth={STROKE} aria-hidden="true" />Upload</>}
        </button>
      )}
      {c.hasFile && isPreviewable(c.fileType) && (
        <a href={`${fileUrl}?inline=1`} target="_blank" rel="noopener noreferrer" className={ICON_BTN}
          aria-label={`Preview document: ${label} (opens in a new tab)`} title="Preview">
          <Eye className="h-4 w-4" strokeWidth={STROKE} aria-hidden="true" />
        </a>
      )}
      {c.hasFile && (
        <a href={fileUrl} download className={ICON_BTN} aria-label={`Download document: ${label}`} title="Download">
          <Download className="h-4 w-4" strokeWidth={STROKE} aria-hidden="true" />
        </a>
      )}
      {review && (
        <>
          <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-border sm:block" />
          <button type="button" onClick={onVerify} disabled={busy || !c.hasFile} className={PRIMARY}
            aria-label={`Verify: ${label}`} aria-describedby={c.hasFile ? undefined : hint}
            title={c.hasFile ? undefined : 'Upload the document before verifying it'}>
            Verify
          </button>
          <button type="button" onClick={onReject} disabled={busy} className={SECONDARY} aria-label={`Reject: ${label}`}>
            Reject
          </button>
          {!c.hasFile && <span id={hint} className="sr-only">Verify is available once the document has been uploaded.</span>}
        </>
      )}
    </div>
  );
}
