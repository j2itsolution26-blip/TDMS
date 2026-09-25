'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import {
  Card, PageHeader, EmptyState, Badge, Pagination, FieldError,
  BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT_CLASS, LABEL_CLASS,
} from '@/components/ui';
import { STUDENT_STATUSES, STUDENT_STATUS_LABELS, type StudentStatus } from '@/types/domain';
import { toDateInput } from '@/lib/dates';

/** Port of livewire/students/index.blade.php. */

export interface StudentRow {
  id: string;
  studentNumber: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  yearLevel: number;
  status: string;
  program: { id: string; name: string; code: string };
  curriculum: { id: string; versionLabel: string };
}

export interface ProgramOption { id: string; name: string; code: string }
export interface CurriculumOption { id: string; versionLabel: string; effectiveSchoolYear: string }

interface Props {
  rows: StudentRow[];
  page: number;
  lastPage: number;
  total: number;
  search: string;
  programs: ProgramOption[];
  canCreate: boolean;
  canUpdate: boolean;
}

const EMPTY = {
  firstName: '', middleName: '', lastName: '', email: '', phone: '',
  dateOfBirth: '', programId: '', curriculumId: '',
  yearLevel: 1, status: 'active' as StudentStatus, enrollmentDate: '',
};

export default function StudentsScreen({
  rows, page, lastPage, total, search, programs, canCreate, canUpdate,
}: Props) {
  const router = useRouter();
  const [term, setTerm] = useState(search);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [curricula, setCurricula] = useState<CurriculumOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * The curriculum select depends on the chosen program, which is what
   * Livewire's `curricula` computed property did on every re-render. Here
   * it is fetched when the program changes.
   */
  useEffect(() => {
    if (!form.programId) { setCurricula([]); return; }
    let cancelled = false;
    api.get<CurriculumOption[]>(`/api/programs/${form.programId}/curricula`).then((r) => {
      if (cancelled) return;
      setCurricula(r.ok ? r.data.filter(() => true) : []);
    });
    return () => { cancelled = true; };
  }, [form.programId]);

  function openCreate() {
    setEditing(null); setForm(EMPTY); setErrors({}); setMessage(null); setShowForm(true);
  }

  function openEdit(s: StudentRow) {
    setEditing(s);
    setForm({
      firstName: s.fullName.split(' ')[0] ?? '',
      middleName: '', lastName: '',
      email: s.email ?? '', phone: s.phone ?? '',
      dateOfBirth: '', programId: s.program.id, curriculumId: s.curriculum.id,
      yearLevel: s.yearLevel, status: s.status as StudentStatus, enrollmentDate: '',
    });
    // The list view carries only a joined full name, so load the record.
    api.get<Record<string, unknown>>(`/api/students/${s.id}`).then((r) => {
      if (!r.ok) return;
      const d = r.data as {
        firstName: string; middleName: string | null; lastName: string;
        email: string | null; phone: string | null; dateOfBirth: string | null;
        programId: string; curriculumId: string; yearLevel: number; status: string;
        enrollmentDate: string | null;
      };
      setForm({
        firstName: d.firstName, middleName: d.middleName ?? '', lastName: d.lastName,
        email: d.email ?? '', phone: d.phone ?? '',
        dateOfBirth: toDateInput(d.dateOfBirth), programId: String(d.programId),
        curriculumId: String(d.curriculumId), yearLevel: d.yearLevel,
        status: d.status as StudentStatus, enrollmentDate: toDateInput(d.enrollmentDate),
      });
    });
    setErrors({}); setMessage(null); setShowForm(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors({}); setMessage(null);
    const result = editing
      ? await api.put(`/api/students/${editing.id}`, form)
      : await api.post('/api/students', form);
    setBusy(false);
    if (!result.ok) { setErrors(result.errors ?? {}); setMessage(result.errors ? null : result.message); return; }
    setShowForm(false);
    router.refresh();
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (term) params.set('search', term);
    router.push(`/students${params.toString() ? `?${params}` : ''}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        subtitle="Enrolled and prospective students."
        actions={canCreate ? (
          <button type="button" className={BUTTON_PRIMARY} onClick={openCreate}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Student
          </button>
        ) : null}
      />

      <form onSubmit={submitSearch} className="flex gap-3">
        <input
          className={INPUT_CLASS}
          placeholder="Search by student number or name…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <button type="submit" className={BUTTON_SECONDARY}>Search</button>
      </form>

      {message && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>}

      <Card padding="p-0">
        {rows.length === 0 ? (
          <EmptyState title="No students found" description="Adjust the search, or add a student record." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Student No.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Program</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Year</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td className="px-6 py-3.5 text-sm font-medium text-navy-900">{s.studentNumber}</td>
                      <td className="px-6 py-3.5 text-sm text-slate-700">
                        {s.fullName}
                        {s.email && <p className="text-xs text-slate-500">{s.email}</p>}
                      </td>
                      <td className="px-6 py-3.5 text-sm text-slate-500">{s.program.code}</td>
                      <td className="px-6 py-3.5 text-sm text-slate-500">{s.yearLevel}</td>
                      <td className="px-6 py-3.5"><Badge status={s.status} /></td>
                      <td className="px-6 py-3.5 text-right text-sm">
                        <div className="flex items-center justify-end gap-3">
                          <Link href={`/students/${s.id}/enrollment`} className="font-medium text-slate-600 hover:text-indigo-600">
                            Enrollment
                          </Link>
                          {canUpdate && (
                            <button type="button" onClick={() => openEdit(s)} className="font-medium text-slate-600 hover:text-indigo-600">
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} lastPage={lastPage} total={total} basePath="/students" query={{ search }} />
          </>
        )}
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Student' : 'New Student'}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="st-first">First Name</label>
              <input id="st-first" className={INPUT_CLASS} maxLength={100} value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              <FieldError messages={errors.firstName} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="st-middle">Middle Name</label>
              <input id="st-middle" className={INPUT_CLASS} maxLength={100} value={form.middleName}
                onChange={(e) => setForm({ ...form, middleName: e.target.value })} />
              <FieldError messages={errors.middleName} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="st-last">Last Name</label>
              <input id="st-last" className={INPUT_CLASS} maxLength={100} value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              <FieldError messages={errors.lastName} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="st-email">Email</label>
              <input id="st-email" type="email" className={INPUT_CLASS} maxLength={255} value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <FieldError messages={errors.email} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="st-phone">Phone</label>
              <input id="st-phone" className={INPUT_CLASS} maxLength={30} value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <FieldError messages={errors.phone} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="st-dob">Date of Birth</label>
              <input id="st-dob" type="date" className={INPUT_CLASS} value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
              <FieldError messages={errors.dateOfBirth} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS} htmlFor="st-program">Program</label>
              <select id="st-program" className={INPUT_CLASS} value={form.programId} required
                onChange={(e) => setForm({ ...form, programId: e.target.value, curriculumId: '' })}>
                <option value="">Select a program…</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
              <FieldError messages={errors.programId} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="st-curriculum">Curriculum</label>
              <select id="st-curriculum" className={INPUT_CLASS} value={form.curriculumId} required
                disabled={!form.programId}
                onChange={(e) => setForm({ ...form, curriculumId: e.target.value })}>
                <option value="">Select a curriculum…</option>
                {curricula.map((c) => (
                  <option key={c.id} value={c.id}>{c.versionLabel} ({c.effectiveSchoolYear})</option>
                ))}
              </select>
              <FieldError messages={errors.curriculumId} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS} htmlFor="st-year">Year Level</label>
              <input id="st-year" type="number" min={1} max={4} className={INPUT_CLASS} value={form.yearLevel}
                onChange={(e) => setForm({ ...form, yearLevel: Number(e.target.value) })} required />
              <FieldError messages={errors.yearLevel} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="st-status">Status</label>
              <select id="st-status" className={INPUT_CLASS} value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as StudentStatus })}>
                {STUDENT_STATUSES.map((s) => <option key={s} value={s}>{STUDENT_STATUS_LABELS[s]}</option>)}
              </select>
              <FieldError messages={errors.status} />
            </div>
          </div>

          {message && <p className="text-sm text-red-600">{message}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={BUTTON_SECONDARY} onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className={BUTTON_PRIMARY} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
