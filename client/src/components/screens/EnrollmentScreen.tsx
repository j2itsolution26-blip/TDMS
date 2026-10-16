import { useState } from 'react';
import Link from '@/lib/link';
import { useRouter } from '@/lib/navigation';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  Card, PageHeader, EmptyState, Badge, Alert, FieldError,
  BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_SUCCESS, BUTTON_DANGER, INPUT_CLASS, LABEL_CLASS,
} from '@/components/ui';
import { formatDate } from '@shared/lib/dates';
import { SEMESTER_LABELS, yearLevelLabel } from '@shared/lib/teaching';
import { approvalNotice, type Placement } from '@/lib/enrollment-notice';
import NewEnrollmentTermDialog, { type TermOptions } from './NewEnrollmentTermDialog';
import CredentialUploadDialog, { type UploadTarget } from './CredentialUploadDialog';
import { CredentialActions, CredentialSummary } from './CredentialParts';
import { CREDENTIAL_UPLOAD_LABEL } from '@shared/lib/credential-files';
import { CREDENTIAL_STATUS_LABELS } from '@shared/types/domain';

/** Port of livewire/enrollment/show.blade.php. */

export interface CredentialRow {
  id: string;
  status: string;
  version: number;
  remarks: string | null;
  rejectionReason: string | null;
  /** A soft copy is on record (the storage key itself never reaches the browser). */
  hasFile: boolean;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  submittedAt: string | null;
  submitter: { name: string } | null;
  verifiedAt: string | null;
  requirement: { id: string; name: string; isRequired: boolean };
  verifier: { name: string } | null;
}

export interface EnrollmentRow {
  id: string;
  schoolYear: string;
  semester: number;
  yearLevel: number;
  status: string;
  approvedAt: string | null;
  approver: { name: string } | null;
  /** The section the student is in for that school year, if any. */
  section: string | null;
}

interface Props {
  student: {
    id: string;
    studentNumber: string;
    fullName: string;
    yearLevel: number;
    status: string;
    program: { name: string; code: string };
    curriculum: { versionLabel: string };
  };
  credentials: CredentialRow[];
  enrollments: EnrollmentRow[];
  allVerified: boolean;
  /** The New Enrollment Term choices (school years, year levels). */
  termOptions: TermOptions;
  canVerify: boolean;
  /** May upload or replace a credential's soft copy. */
  canUpload: boolean;
  canEnroll: boolean;
}

export default function EnrollmentScreen({
  student, credentials, enrollments, allVerified, termOptions, canVerify, canUpload, canEnroll,
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [flash, setFlash] = useState<string | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [uploading, setUploading] = useState<UploadTarget | null>(null);

  const [dropping, setDropping] = useState<string | null>(null);
  const [dropReason, setDropReason] = useState('');
  // A pending enrollment is rejected; an enrolled one is dropped. Both need a reason.
  const [dropAs, setDropAs] = useState<'dropped' | 'rejected'>('dropped');

  function reset() { setFlash(null); setFlashError(null); setErrors({}); }

  async function verify(credential: CredentialRow) {
    if (busy) return;
    await confirm({
      tone: 'success',
      title: 'Verify Credential',
      description: 'Confirm that you have reviewed this document. A verified credential can no longer be replaced.',
      details: [
        { label: 'Student', value: `${student.fullName} (${student.studentNumber})` },
        { label: 'Requirement', value: credential.requirement.name },
        { label: 'Document', value: credential.fileName ? `${credential.fileName} (v${credential.version})` : '—' },
      ],
      confirmLabel: 'Verify credential',
      pendingLabel: 'Verifying…',
      action: async () => {
        setBusy(true); reset();
        const result = await api.post(`/api/v1/credentials/${credential.id}/verify`, { remarks: '' });
        setBusy(false);
        if (!result.ok) { setFlashError(result.message); return false; }
        setFlash('Credential verified.');
        router.refresh();
        return true;
      },
    });
  }

  async function confirmReject(event: React.FormEvent) {
    event.preventDefault();
    if (!rejecting) return;
    setBusy(true); reset();
    const result = await api.post(`/api/v1/credentials/${rejecting}/reject`, { reason: rejectionReason });
    setBusy(false);
    if (!result.ok) { setErrors(result.errors ?? {}); if (!result.errors) setFlashError(result.message); return; }
    setRejecting(null); setRejectionReason('');
    setFlash('Credential rejected.');
    router.refresh();
  }

  async function confirmEnrollment(enrollment: EnrollmentRow) {
    if (busy) return;
    await confirm({
      tone: 'success',
      title: 'Confirm Enrollment Approval',
      description: 'The student becomes Enrolled for this term. This cannot be undone.',
      details: [
        { label: 'Student', value: `${student.fullName} (${student.studentNumber})` },
        { label: 'Program', value: `${student.program.code} · ${student.program.name}` },
        { label: 'School year', value: enrollment.schoolYear },
        { label: 'Semester', value: SEMESTER_LABELS[enrollment.semester] ?? `Semester ${enrollment.semester}` },
        { label: 'Year level', value: yearLevelLabel(enrollment.yearLevel) },
      ],
      confirmLabel: 'Approve enrollment',
      pendingLabel: 'Approving…',
      action: async () => {
        setBusy(true); reset();
        const result = await api.post<{ placement: Placement | null }>(`/api/v1/enrollments/${enrollment.id}/transition`, {
          status: 'enrolled', reason: '',
        });
        setBusy(false);
        if (!result.ok) {
          // e.g. "This student still has unverified or missing required credentials."
          setFlashError(result.message);
          return false;
        }
        setFlash(approvalNotice(student.fullName, result.data.placement));
        router.refresh();
        return true;
      },
    });
  }

  async function confirmDrop(event: React.FormEvent) {
    event.preventDefault();
    if (!dropping) return;
    setBusy(true); reset();
    const result = await api.post<{ released: string[] }>(`/api/v1/enrollments/${dropping}/transition`, {
      status: dropAs, reason: dropReason,
    });
    setBusy(false);
    if (!result.ok) { setErrors(result.errors ?? {}); if (!result.errors) setFlashError(result.message); return; }
    setDropping(null); setDropReason('');
    const freed = result.data.released ?? [];
    setFlash(dropAs === 'rejected' ? 'Enrollment rejected.' : `Enrollment dropped.${freed.length ? ` The seat in ${freed.join(', ')} is free again.` : ''}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/students" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          &larr; Back to Students
        </Link>
      </div>

      <PageHeader
        title={student.fullName}
        subtitle={`${student.studentNumber} · ${student.program.name} · ${student.curriculum.versionLabel}`}
        actions={canEnroll ? (
          <button type="button" className={BUTTON_PRIMARY} onClick={() => { reset(); setShowEnrollForm(true); }}>
            New Enrollment Term
          </button>
        ) : null}
      />

      {flash && <Alert type="success">{flash}</Alert>}
      {flashError && <Alert type="danger">{flashError}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Year Level</p>
          <p className="mt-1 font-semibold text-navy-900">{student.yearLevel}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Student Status</p>
          <p className="mt-1"><Badge status={student.status} /></p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Required Credentials</p>
          <p className="mt-1">
            <Badge status={allVerified ? 'verified' : 'pending'} label={allVerified ? 'All verified' : 'Outstanding'} />
          </p>
        </Card>
      </div>

      {/* Credentials: each requirement's soft copy, its review, and what can be done with it. */}
      <Card padding="p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold text-navy-900">Credentials</h2>
          <p className="text-xs text-slate-500">{CREDENTIAL_UPLOAD_LABEL} up to 4 MB · an upload awaits review until it is verified</p>
        </div>

        {credentials.length === 0 ? (
          <EmptyState title="No credential records" description="Requirements are created when an application is approved." />
        ) : (
          <>
            {/* Laptop and up: the table. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-left text-xs font-semibold text-slate-500 lg:px-6">Requirement</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-500">Version</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-500">Verified</th>
                    <th scope="col" className="px-5 py-3 text-right text-xs font-semibold text-slate-500 lg:px-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {credentials.map((c) => (
                    <tr key={c.id} className="align-top">
                      <td className="max-w-[26rem] px-5 py-4 text-sm lg:px-6">
                        <CredentialSummary c={c} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-4"><Badge status={c.status} label={CREDENTIAL_STATUS_LABELS[c.status as keyof typeof CREDENTIAL_STATUS_LABELS]} /></td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm tabular-nums text-slate-600">v{c.version}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-600">
                        {c.verifiedAt ? formatDate(c.verifiedAt) : '—'}
                        {c.verifier && <p className="text-xs text-slate-500">{c.verifier.name}</p>}
                      </td>
                      <td className="px-5 py-4 lg:px-6">
                        <CredentialActions c={c} busy={busy} canUpload={canUpload} canVerify={canVerify}
                          onUpload={() => { reset(); setUploading({ credentialId: c.id, requirement: c.requirement.name, current: c.hasFile ? c.fileName : null }); }}
                          onVerify={() => verify(c)}
                          onReject={() => { reset(); setRejecting(c.id); setRejectionReason(''); }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phones and small tablets: one card per requirement, nothing hidden. */}
            <ul className="divide-y divide-border md:hidden">
              {credentials.map((c) => (
                <li key={c.id} className="space-y-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-sm"><CredentialSummary c={c} /></div>
                    <Badge status={c.status} label={CREDENTIAL_STATUS_LABELS[c.status as keyof typeof CREDENTIAL_STATUS_LABELS]} />
                  </div>
                  <p className="text-xs text-slate-500">
                    Version {c.version} · {c.verifiedAt ? `Verified ${formatDate(c.verifiedAt)}${c.verifier ? ` by ${c.verifier.name}` : ''}` : 'Not verified'}
                  </p>
                  <CredentialActions c={c} busy={busy} canUpload={canUpload} canVerify={canVerify} align="start"
                    onUpload={() => { reset(); setUploading({ credentialId: c.id, requirement: c.requirement.name, current: c.hasFile ? c.fileName : null }); }}
                    onVerify={() => verify(c)}
                    onReject={() => { reset(); setRejecting(c.id); setRejectionReason(''); }} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <CredentialUploadDialog
        target={uploading}
        student={{ fullName: student.fullName, studentNumber: student.studentNumber }}
        onClose={() => setUploading(null)}
        onUploaded={(message) => { setUploading(null); setFlash(message); router.refresh(); }}
      />

      {/* Enrollment terms */}
      <Card padding="p-0">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-navy-900">Enrollment Terms</h2>
        </div>

        {enrollments.length === 0 ? (
          <EmptyState title="No enrollment terms" description="Create a term to begin the enrollment workflow." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">School Year</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Sem</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Year Level</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Section</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Approved</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {enrollments.map((e) => (
                  <tr key={e.id}>
                    <td className="px-6 py-3.5 text-sm font-medium text-navy-900">{e.schoolYear}</td>
                    <td className="px-6 py-3.5 text-sm text-slate-500">{SEMESTER_LABELS[e.semester] ?? e.semester}</td>
                    <td className="whitespace-nowrap px-6 py-3.5 text-sm text-slate-500">{yearLevelLabel(e.yearLevel)}</td>
                    <td className="px-6 py-3.5 text-sm text-slate-600">{e.section ?? <span className="text-xs text-slate-400">{e.status === 'pending' ? 'Assigned on approval' : '—'}</span>}</td>
                    <td className="px-6 py-3.5"><Badge status={e.status} /></td>
                    <td className="px-6 py-3.5 text-sm text-slate-500">
                      {e.approvedAt ? formatDate(e.approvedAt) : '—'}
                      {e.approver && <p className="text-xs text-slate-400">{e.approver.name}</p>}
                    </td>
                    <td className="px-6 py-3.5 text-right text-sm">
                      {canEnroll && e.status === 'pending' && (
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => confirmEnrollment(e)} disabled={busy} className={BUTTON_SUCCESS}>
                            Confirm Enrollment
                          </button>
                          <button type="button" disabled={busy} className={BUTTON_SECONDARY}
                            onClick={() => { reset(); setDropAs('rejected'); setDropping(e.id); setDropReason(''); }}>
                            Reject
                          </button>
                        </div>
                      )}
                      {canEnroll && e.status === 'enrolled' && (
                        <button type="button" disabled={busy} className={BUTTON_SECONDARY}
                          onClick={() => { reset(); setDropAs('dropped'); setDropping(e.id); setDropReason(''); }}>
                          Drop
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Reject credential */}
      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title="Reject Credential" maxWidth="sm:max-w-lg">
        <form onSubmit={confirmReject} className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="rej-reason">Reason</label>
            <textarea id="rej-reason" rows={4} maxLength={500} className={INPUT_CLASS}
              value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} required />
            <FieldError messages={errors.reason} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setRejecting(null)}>Cancel</button>
            <button type="submit" className={BUTTON_DANGER} disabled={busy}>{busy ? 'Rejecting…' : 'Reject'}</button>
          </div>
        </form>
      </Modal>

      {/* New enrollment term */}
      <NewEnrollmentTermDialog
        open={showEnrollForm}
        onClose={() => setShowEnrollForm(false)}
        onCreated={(message) => { setShowEnrollForm(false); setFlash(message); router.refresh(); }}
        student={{ id: student.id, fullName: student.fullName, studentNumber: student.studentNumber, yearLevel: student.yearLevel, programCode: student.program.code }}
        existing={enrollments}
        options={termOptions}
      />

      {/* Drop enrollment */}
      <Modal open={dropping !== null} onClose={() => setDropping(null)} title={dropAs === 'rejected' ? 'Reject Enrollment' : 'Drop Enrollment'} maxWidth="sm:max-w-lg">
        <form onSubmit={confirmDrop} className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="drop-reason">Reason</label>
            <textarea id="drop-reason" rows={4} maxLength={500} className={INPUT_CLASS}
              value={dropReason} onChange={(e) => setDropReason(e.target.value)} required />
            <FieldError messages={errors.reason} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setDropping(null)}>Cancel</button>
            <button type="submit" className={BUTTON_DANGER} disabled={busy}>{dropAs === 'rejected' ? (busy ? 'Rejecting…' : 'Reject') : (busy ? 'Dropping…' : 'Drop')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
