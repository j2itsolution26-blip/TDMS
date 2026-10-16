import { useId } from 'react';
import { ChevronRight, Download, Eye, FileText, History, RefreshCw, Upload } from 'lucide-react';
import { formatDate } from '@shared/lib/dates';
import { fileTypeLabel, formatBytes, isPreviewable } from '@shared/lib/credential-files';
import type { CredentialHistoryRow, CredentialRow } from './EnrollmentScreen';

/**
 * One credential's row parts on the student's Enrollment page: the
 * requirement, the document on record (and its earlier versions), and what can
 * be done — Upload or Replace, Preview, Download, and the existing Verify and
 * Reject. Every action is a visible button; none is tucked into a menu. Files
 * are served only by the authorized routes (/api/v1/credentials/:id/file and
 * …/documents/:documentId/file), never by a storage address.
 */

const STROKE = 1.9;
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';
const BTN = `inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
const PRIMARY = `${BTN} bg-primary-600 text-white hover:bg-primary-700`;
const SECONDARY = `${BTN} border border-[#D6E2DD] bg-white text-ink hover:bg-surface`;
/** Preview and Download: square icon buttons, named for screen readers and on hover. */
const ICON_BTN = `${SECONDARY} w-8 px-0`;
const SMALL_ICON_BTN = `inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-surface hover:text-ink ${FOCUS}`;

const REVIEW_LABELS: Record<string, string> = { pending: 'Not reviewed', verified: 'Verified', rejected: 'Rejected' };

/** "PDF · 1.2 MB" — what the file is, briefly. */
function fileFacts(type: string | null, size: number | null): string {
  return [fileTypeLabel(type), size ? formatBytes(size) : null].filter(Boolean).join(' · ');
}

export function CredentialRequirement({ c }: { c: CredentialRow }) {
  return (
    <>
      <p className="font-semibold text-navy-900">{c.requirement.name}</p>
      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        c.requirement.isRequired ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-600'
      }`}>
        {c.requirement.isRequired ? 'Required' : 'Optional'}
      </span>
      {c.status === 'rejected' && c.rejectionReason && (
        <p className="mt-1.5 text-xs font-medium text-red-700">Rejected: {c.rejectionReason}</p>
      )}
    </>
  );
}

export function CredentialDocument({ c }: { c: CredentialRow }) {
  // A fixed width, so a long file name is truncated (full name on hover) instead of widening the table.
  return (
    <div className="w-full xl:max-w-[13rem]">
      {c.hasFile && c.fileName ? (
        <p className="flex min-w-0 items-start gap-1.5 text-xs text-slate-600">
          <FileText className="mt-px h-3.5 w-3.5 shrink-0 text-primary-600" strokeWidth={STROKE} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-navy-900" title={c.fileName}>{c.fileName}</span>
            {fileFacts(c.fileType, c.fileSize) && <span className="block text-slate-500">{fileFacts(c.fileType, c.fileSize)}</span>}
            {(c.submittedAt || c.submitter) && (
              <span className="block text-slate-500">
                {[c.submittedAt ? `Uploaded ${formatDate(c.submittedAt)}` : 'Uploaded', c.submitter ? `by ${c.submitter.name}` : null].filter(Boolean).join(' ')}
              </span>
            )}
          </span>
        </p>
      ) : (
        <p className="text-xs font-medium text-slate-500">No document uploaded</p>
      )}
      {c.history.length > 0 && <CredentialHistory credentialId={c.id} requirement={c.requirement.name} history={c.history} />}
    </div>
  );
}

/** Earlier versions, collapsed by default: each with its verdict, and its own preview and download. */
function CredentialHistory({ credentialId, requirement, history }: { credentialId: string; requirement: string; history: CredentialHistoryRow[] }) {
  return (
    <details className="group mt-2">
      <summary className={`inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs font-semibold text-primary-700 hover:text-primary-800 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" strokeWidth={2} aria-hidden="true" />
        <History className="h-3.5 w-3.5" strokeWidth={STROKE} aria-hidden="true" />
        Earlier versions ({history.length})
      </summary>
      <ul className="mt-2 space-y-2 border-l-2 border-[#D6E2DD] pl-3">
        {history.map((d) => {
          const url = `/api/v1/credentials/${credentialId}/documents/${d.id}/file`;
          const verdict = REVIEW_LABELS[d.review] ?? d.review;
          return (
            <li key={d.id} className="flex items-start justify-between gap-2 text-xs">
              <span className="min-w-0">
                <span className="block truncate font-medium text-navy-900" title={d.fileName}>v{d.version} · {d.fileName}</span>
                <span className="block text-slate-500">
                  {[fileFacts(d.fileType, d.fileSize) || null, d.uploadedAt ? `uploaded ${formatDate(d.uploadedAt)}` : null].filter(Boolean).join(' · ')}
                </span>
                <span className={`block ${d.review === 'verified' ? 'text-primary-700' : d.review === 'rejected' ? 'text-red-700' : 'text-slate-500'}`}>
                  {verdict}{d.reviewedAt ? ` ${formatDate(d.reviewedAt)}` : ''}{d.reviewer ? ` by ${d.reviewer.name}` : ''}
                  {d.rejectionReason ? ` — ${d.rejectionReason}` : ''}
                  {` · replaced ${formatDate(d.replacedAt)}`}
                </span>
              </span>
              <span className="flex shrink-0 items-center">
                {isPreviewable(d.fileType) && (
                  <a href={`${url}?inline=1`} target="_blank" rel="noopener noreferrer" className={SMALL_ICON_BTN}
                    aria-label={`Preview ${requirement} version ${d.version} (opens in a new tab)`} title="Preview">
                    <Eye className="h-3.5 w-3.5" strokeWidth={STROKE} aria-hidden="true" />
                  </a>
                )}
                <a href={url} download className={SMALL_ICON_BTN} aria-label={`Download ${requirement} version ${d.version}`} title="Download">
                  <Download className="h-3.5 w-3.5" strokeWidth={STROKE} aria-hidden="true" />
                </a>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** The Verified column: who settled the review and when. A rejection is shown as such, not as a verification. */
export function CredentialReview({ c, compact = false }: { c: CredentialRow; compact?: boolean }) {
  if ((c.status !== 'verified' && c.status !== 'rejected') || !c.verifiedAt) {
    return compact ? <>Not verified</> : <span className="text-slate-400">—</span>;
  }
  const label = c.status === 'verified' ? 'Verified' : 'Rejected';
  if (compact) return <>{label} {formatDate(c.verifiedAt)}{c.verifier ? ` by ${c.verifier.name}` : ''}</>;
  return (
    <>
      <span className={c.status === 'rejected' ? 'text-red-700' : undefined}>
        {c.status === 'rejected' && 'Rejected '}{formatDate(c.verifiedAt)}
      </span>
      {c.verifier && <span className="block text-xs text-slate-500">{c.verifier.name}</span>}
    </>
  );
}

export function CredentialActions({
  c, busy, canUpload, canReplaceVerified, canVerify, onUpload, onVerify, onReject, align = 'end',
}: {
  c: CredentialRow;
  busy: boolean;
  canUpload: boolean;
  /** A verifier may replace a verified document; it then goes back to review. */
  canReplaceVerified: boolean;
  canVerify: boolean;
  onUpload: () => void;
  onVerify: () => void;
  onReject: () => void;
  align?: 'start' | 'end';
}) {
  const hint = useId();
  const verified = c.status === 'verified';
  const fileUrl = `/api/v1/credentials/${c.id}/file`;
  const label = c.requirement.name;
  const upload = canUpload && (!verified || canReplaceVerified);
  const review = canVerify && !verified;

  // Two groups that each stay on one line — the document's actions, then the review —
  // so a narrow column wraps between them, never in the middle of one.
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      <div className="flex flex-nowrap items-center gap-1.5">
      {upload && (
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
      </div>
      {review && (
        <div className="flex flex-nowrap items-center gap-1.5">
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
        </div>
      )}
    </div>
  );
}
