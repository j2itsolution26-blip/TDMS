'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import {
  Card, PageHeader, EmptyState, Badge, Pagination, FieldError, Alert,
  BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_SUCCESS, BUTTON_DANGER, INPUT_CLASS, LABEL_CLASS,
} from '@/components/ui';
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@/types/domain';
import { formatDate } from '@/lib/dates';

/** Port of livewire/applications/index.blade.php. */

export interface ApplicationRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  createdAt: string | null;
  program: { id: string; name: string; code: string };
  student: { id: string; studentNumber: string } | null;
}

interface Props {
  rows: ApplicationRow[];
  page: number;
  lastPage: number;
  total: number;
  statusFilter: string;
  programs: { id: string; name: string; code: string }[];
  canCreate: boolean;
  canReview: boolean;
}

const EMPTY = {
  firstName: '', middleName: '', lastName: '', email: '', phone: '',
  dateOfBirth: '', programId: '',
};

export default function ApplicationsScreen({
  rows, page, lastPage, total, statusFilter, programs, canCreate, canReview,
}: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setForm(EMPTY); setErrors({}); setFlash(null); setFlashError(null); setShowForm(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors({}); setFlashError(null);
    const result = await api.post('/api/applications', form);
    setBusy(false);
    if (!result.ok) { setErrors(result.errors ?? {}); setFlashError(result.errors ? null : result.message); return; }
    setShowForm(false);
    setFlash('Application recorded.');
    router.refresh();
  }

  async function approve(row: ApplicationRow) {
    setBusy(true); setFlash(null); setFlashError(null);
    const result = await api.post<{ studentNumber: string }>(`/api/applications/${row.id}/approve`);
    setBusy(false);
    if (!result.ok) {
      // e.g. "This program has no active curriculum to enroll into."
      setFlashError(result.message);
      return;
    }
    setFlash(`Approved — student number ${result.data.studentNumber} created.`);
    router.refresh();
  }

  async function confirmReturn(event: React.FormEvent) {
    event.preventDefault();
    if (!returning) return;
    setBusy(true); setErrors({}); setFlashError(null);
    const result = await api.post(`/api/applications/${returning}/return`, { reason: returnReason });
    setBusy(false);
    if (!result.ok) { setErrors(result.errors ?? {}); setFlashError(result.errors ? null : result.message); return; }
    setReturning(null); setReturnReason('');
    setFlash('Application returned to applicant.');
    router.refresh();
  }

  function changeFilter(status: string) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    router.push(`/applications${params.toString() ? `?${params}` : ''}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        subtitle="Incoming applications awaiting review."
        actions={canCreate ? (
          <button type="button" className={BUTTON_PRIMARY} onClick={openCreate}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Record Application
          </button>
        ) : null}
      />

      {flash && <Alert type="success">{flash}</Alert>}
      {flashError && <Alert type="danger">{flashError}</Alert>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => changeFilter('')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${statusFilter === '' ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
          All
        </button>
        {APPLICATION_STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => changeFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${statusFilter === s ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
            {APPLICATION_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <Card padding="p-0">
        {rows.length === 0 ? (
          <EmptyState title="No applications" description="Applications matching this filter will appear here." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Applicant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Program</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Received</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-6 py-3.5 text-sm">
                        <p className="font-medium text-navy-900">{row.fullName}</p>
                        {row.email && <p className="text-xs text-slate-500">{row.email}</p>}
                        {row.student && (
                          <p className="text-xs text-green-700">Student No. {row.student.studentNumber}</p>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-sm text-slate-500">{row.program.code}</td>
                      <td className="px-6 py-3.5 text-sm text-slate-500">{formatDate(row.createdAt)}</td>
                      <td className="px-6 py-3.5"><Badge status={row.status} /></td>
                      <td className="px-6 py-3.5 text-right text-sm">
                        {canReview && row.status !== 'approved' && (
                          <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={() => approve(row)} disabled={busy} className={BUTTON_SUCCESS}>
                              Approve
                            </button>
                            <button type="button" disabled={busy}
                              onClick={() => { setReturning(row.id); setReturnReason(''); setErrors({}); }}
                              className={BUTTON_SECONDARY}>
                              Return
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} lastPage={lastPage} total={total} basePath="/applications" query={{ status: statusFilter || undefined }} />
          </>
        )}
      </Card>

      {/* Record a new application */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Record Application">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="a-first">First Name</label>
              <input id="a-first" className={INPUT_CLASS} maxLength={100} value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              <FieldError messages={errors.firstName} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="a-middle">Middle Name</label>
              <input id="a-middle" className={INPUT_CLASS} maxLength={100} value={form.middleName}
                onChange={(e) => setForm({ ...form, middleName: e.target.value })} />
              <FieldError messages={errors.middleName} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="a-last">Last Name</label>
              <input id="a-last" className={INPUT_CLASS} maxLength={100} value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              <FieldError messages={errors.lastName} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="a-email">Email</label>
              <input id="a-email" type="email" className={INPUT_CLASS} maxLength={255} value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <FieldError messages={errors.email} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="a-phone">Phone</label>
              <input id="a-phone" className={INPUT_CLASS} maxLength={30} value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <FieldError messages={errors.phone} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="a-dob">Date of Birth</label>
              <input id="a-dob" type="date" className={INPUT_CLASS} value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
              <FieldError messages={errors.dateOfBirth} />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="a-program">Program</label>
            <select id="a-program" className={INPUT_CLASS} value={form.programId} required
              onChange={(e) => setForm({ ...form, programId: e.target.value })}>
              <option value="">Select a program…</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
            <FieldError messages={errors.programId} />
          </div>

          {flashError && <p className="text-sm text-red-600">{flashError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      {/* Return to applicant */}
      <Modal open={returning !== null} onClose={() => setReturning(null)} title="Return Application" maxWidth="sm:max-w-lg">
        <form onSubmit={confirmReturn} className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="return-reason">Reason</label>
            <textarea id="return-reason" rows={4} maxLength={500} className={INPUT_CLASS}
              value={returnReason} onChange={(e) => setReturnReason(e.target.value)} required />
            <FieldError messages={errors.reason} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setReturning(null)}>Cancel</button>
            <button type="submit" className={BUTTON_DANGER} disabled={busy}>{busy ? 'Returning…' : 'Return'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
