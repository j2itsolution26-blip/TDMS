'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import {
  Card, PageHeader, EmptyState, Badge, Alert, FieldError,
  BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_SUCCESS, BUTTON_DANGER, INPUT_CLASS, LABEL_CLASS,
} from '@/components/ui';
import { formatDate } from '@/lib/dates';

/** Port of livewire/enrollment/show.blade.php. */

export interface CredentialRow {
  id: string;
  status: string;
  version: number;
  remarks: string | null;
  rejectionReason: string | null;
  filePath: string | null;
  submittedAt: string | null;
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
  defaultSchoolYear: string;
  canVerify: boolean;
  canEnroll: boolean;
}

export default function EnrollmentScreen({
  student, credentials, enrollments, allVerified, defaultSchoolYear, canVerify, canEnroll,
}: Props) {
  const router = useRouter();
  const [flash, setFlash] = useState<string | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [enrollForm, setEnrollForm] = useState({
    schoolYear: defaultSchoolYear,
    semester: 1,
    yearLevel: student.yearLevel || 1,
  });

  const [dropping, setDropping] = useState<string | null>(null);
  const [dropReason, setDropReason] = useState('');

  function reset() { setFlash(null); setFlashError(null); setErrors({}); }

  async function verify(credential: CredentialRow) {
    setBusy(true); reset();
    const result = await api.post(`/api/credentials/${credential.id}/verify`, { remarks: '' });
    setBusy(false);
    if (!result.ok) { setFlashError(result.message); return; }
    setFlash('Credential verified.');
    router.refresh();
  }

  async function confirmReject(event: React.FormEvent) {
    event.preventDefault();
    if (!rejecting) return;
    setBusy(true); reset();
    const result = await api.post(`/api/credentials/${rejecting}/reject`, { reason: rejectionReason });
    setBusy(false);
    if (!result.ok) { setErrors(result.errors ?? {}); if (!result.errors) setFlashError(result.message); return; }
    setRejecting(null); setRejectionReason('');
    setFlash('Credential rejected.');
    router.refresh();
  }

  async function saveEnrollment(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); reset();
    const result = await api.post(`/api/students/${student.id}/enrollments`, enrollForm);
    setBusy(false);
    if (!result.ok) { setErrors(result.errors ?? {}); if (!result.errors) setFlashError(result.message); return; }
    setShowEnrollForm(false);
    setFlash('Enrollment term created as pending.');
    router.refresh();
  }

  async function confirmEnrollment(enrollment: EnrollmentRow) {
    setBusy(true); reset();
    const result = await api.post(`/api/enrollments/${enrollment.id}/transition`, {
      status: 'enrolled', reason: '',
    });
    setBusy(false);
    if (!result.ok) {
      // e.g. "This student still has unverified or missing required credentials."
      setFlashError(result.message);
      return;
    }
    setFlash('Student officially enrolled.');
    router.refresh();
  }

  async function confirmDrop(event: React.FormEvent) {
    event.preventDefault();
    if (!dropping) return;
    setBusy(true); reset();
    const result = await api.post(`/api/enrollments/${dropping}/transition`, {
      status: 'dropped', reason: dropReason,
    });
    setBusy(false);
    if (!result.ok) { setErrors(result.errors ?? {}); if (!result.errors) setFlashError(result.message); return; }
    setDropping(null); setDropReason('');
    setFlash('Enrollment dropped.');
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

      {/* Credentials */}
      <Card padding="p-0">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-navy-900">Credentials</h2>
        </div>

        {credentials.length === 0 ? (
          <EmptyState title="No credential records" description="Requirements are created when an application is approved." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Requirement</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Version</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Verified</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {credentials.map((c) => (
                  <tr key={c.id}>
                    <td className="px-6 py-3.5 text-sm">
                      <p className="font-medium text-navy-900">{c.requirement.name}</p>
                      {c.requirement.isRequired && <p className="text-xs text-slate-500">Required</p>}
                      {c.rejectionReason && <p className="text-xs text-red-600">{c.rejectionReason}</p>}
                    </td>
                    <td className="px-6 py-3.5"><Badge status={c.status} /></td>
                    <td className="px-6 py-3.5 text-sm text-slate-500">v{c.version}</td>
                    <td className="px-6 py-3.5 text-sm text-slate-500">
                      {c.verifiedAt ? formatDate(c.verifiedAt) : '—'}
                      {c.verifier && <p className="text-xs text-slate-400">{c.verifier.name}</p>}
                    </td>
                    <td className="px-6 py-3.5 text-right text-sm">
                      {canVerify && c.status !== 'verified' && (
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => verify(c)} disabled={busy} className={BUTTON_SUCCESS}>
                            Verify
                          </button>
                          <button type="button" disabled={busy} className={BUTTON_SECONDARY}
                            onClick={() => { reset(); setRejecting(c.id); setRejectionReason(''); }}>
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Approved</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {enrollments.map((e) => (
                  <tr key={e.id}>
                    <td className="px-6 py-3.5 text-sm font-medium text-navy-900">{e.schoolYear}</td>
                    <td className="px-6 py-3.5 text-sm text-slate-500">{e.semester}</td>
                    <td className="px-6 py-3.5 text-sm text-slate-500">{e.yearLevel}</td>
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
                            onClick={() => { reset(); setDropping(e.id); setDropReason(''); }}>
                            Drop
                          </button>
                        </div>
                      )}
                      {canEnroll && e.status === 'enrolled' && (
                        <button type="button" disabled={busy} className={BUTTON_SECONDARY}
                          onClick={() => { reset(); setDropping(e.id); setDropReason(''); }}>
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
      <Modal open={showEnrollForm} onClose={() => setShowEnrollForm(false)} title="New Enrollment Term" maxWidth="sm:max-w-lg">
        <form onSubmit={saveEnrollment} className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="en-year">School Year</label>
            <input id="en-year" className={INPUT_CLASS} placeholder="2025-2026" value={enrollForm.schoolYear}
              onChange={(e) => setEnrollForm({ ...enrollForm, schoolYear: e.target.value })} required />
            <FieldError messages={errors.schoolYear} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS} htmlFor="en-sem">Semester</label>
              <select id="en-sem" className={INPUT_CLASS} value={enrollForm.semester}
                onChange={(e) => setEnrollForm({ ...enrollForm, semester: Number(e.target.value) })}>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
              <FieldError messages={errors.semester} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="en-level">Year Level</label>
              <input id="en-level" type="number" min={1} max={4} className={INPUT_CLASS} value={enrollForm.yearLevel}
                onChange={(e) => setEnrollForm({ ...enrollForm, yearLevel: Number(e.target.value) })} required />
              <FieldError messages={errors.yearLevel} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setShowEnrollForm(false)}>Cancel</button>
            <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>{busy ? 'Saving…' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      {/* Drop enrollment */}
      <Modal open={dropping !== null} onClose={() => setDropping(null)} title="Drop Enrollment" maxWidth="sm:max-w-lg">
        <form onSubmit={confirmDrop} className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="drop-reason">Reason</label>
            <textarea id="drop-reason" rows={4} maxLength={500} className={INPUT_CLASS}
              value={dropReason} onChange={(e) => setDropReason(e.target.value)} required />
            <FieldError messages={errors.reason} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setDropping(null)}>Cancel</button>
            <button type="submit" className={BUTTON_DANGER} disabled={busy}>{busy ? 'Dropping…' : 'Drop'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
