import { useState } from 'react';
import Link from '@/lib/link';
import { useRouter } from '@/lib/navigation';
import { useOpenOnNew } from '@/lib/use-open-on-new';
import { succeeded, type Notice } from '@/lib/notice';
import StudentFormModal from './StudentFormModal';
import {
  Alert, Card, PageHeader, EmptyState, Badge, Pagination,
  BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT_CLASS,
} from '@/components/ui';
import { YEAR_LEVELS, yearLevelLabel } from '@shared/lib/teaching';
import { STUDENT_STATUSES, STUDENT_STATUS_LABELS } from '@shared/types/domain';

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
export interface SchoolYearOption { id: string; label: string; status: string; currentSemester: number }
export interface CurriculumOption { id: string; versionLabel: string; effectiveSchoolYear: string; isActive?: boolean }

interface Props {
  rows: StudentRow[];
  page: number;
  lastPage: number;
  total: number;
  search: string;
  /** Program (id), year level and status filters from the URL; '' is all. */
  filters: { program: string; yearLevel: string; status: string };
  programs: ProgramOption[];
  /** Open school years, for a new student's first enrollment. */
  schoolYears: SchoolYearOption[];
  canCreate: boolean;
  canUpdate: boolean;
}

export default function StudentsScreen({
  rows, page, lastPage, total, search, filters, programs, schoolYears, canCreate, canUpdate,
}: Props) {
  const router = useRouter();
  useOpenOnNew(canCreate, openCreate);
  const [term, setTerm] = useState(search);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function openCreate() {
    setEditing(null); setNotice(null); setShowForm(true);
  }

  function openEdit(s: StudentRow) {
    setEditing(s); setNotice(null); setShowForm(true);
  }

  // Search and filters together in the URL; any change starts again at page 1.
  function go(next: Partial<Props['filters']> & { search?: string }) {
    const merged = { search: term, ...filters, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    router.push(`/students${params.toString() ? `?${params}` : ''}`);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    go({ search: term });
  }

  const filtered = Boolean(search || filters.program || filters.yearLevel || filters.status);
  const SELECT = `${INPUT_CLASS} sm:w-auto`;

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

      <form onSubmit={submitSearch} className="flex flex-col gap-3 lg:flex-row" role="search" aria-label="Find students">
        <div className="flex min-w-0 flex-1 gap-3">
          <label htmlFor="students-search" className="sr-only">Search by student number or name</label>
          <input
            id="students-search"
            className={INPUT_CLASS}
            placeholder="Search by student number or name…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <button type="submit" className={BUTTON_SECONDARY}>Search</button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex">
          <label className="sr-only" htmlFor="students-program">Program</label>
          <select id="students-program" className={SELECT} value={filters.program} onChange={(e) => go({ program: e.target.value })}>
            <option value="">All programs</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
          <label className="sr-only" htmlFor="students-year">Year level</label>
          <select id="students-year" className={SELECT} value={filters.yearLevel} onChange={(e) => go({ yearLevel: e.target.value })}>
            <option value="">All year levels</option>
            {YEAR_LEVELS.map((y) => <option key={y} value={y}>{yearLevelLabel(y)}</option>)}
          </select>
          <label className="sr-only" htmlFor="students-status">Status</label>
          <select id="students-status" className={SELECT} value={filters.status} onChange={(e) => go({ status: e.target.value })}>
            <option value="">All statuses</option>
            {STUDENT_STATUSES.map((st) => <option key={st} value={st}>{STUDENT_STATUS_LABELS[st]}</option>)}
          </select>
        </div>
      </form>

      {notice && <Alert type={notice.tone}>{notice.text}</Alert>}

      <Card padding="p-0">
        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? 'No students match these filters' : 'No students yet'}
            description={filtered
              ? `Nothing for ${[filters.program && programs.find((p) => p.id === filters.program)?.code, filters.yearLevel && yearLevelLabel(Number(filters.yearLevel)), filters.status && STUDENT_STATUS_LABELS[filters.status as keyof typeof STUDENT_STATUS_LABELS], search && `“${search}”`].filter(Boolean).join(' · ')}. Change or clear the filters.`
              : 'Add a student record with New Student.'}
          />
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
                      <td className="whitespace-nowrap px-6 py-3.5 text-sm font-medium text-ink">{s.studentNumber}</td>
                      <td className="whitespace-nowrap px-6 py-3.5 text-sm text-slate-700">
                        {s.fullName}
                        {s.email && <p className="text-xs text-slate-500">{s.email}</p>}
                      </td>
                      <td className="px-6 py-3.5 text-sm">
                        <span className="font-semibold text-navy-900">{s.program.code}</span>
                        <p className="max-w-[14rem] truncate text-xs text-slate-500" title={s.program.name}>{s.program.name}</p>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3.5 text-sm text-slate-500">{yearLevelLabel(s.yearLevel)}</td>
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
            <Pagination page={page} lastPage={lastPage} total={total} basePath="/students" query={{ search, ...filters }} />
          </>
        )}
      </Card>

      <StudentFormModal
        open={showForm}
        editing={editing}
        programs={programs}
        schoolYears={schoolYears}
        onClose={() => setShowForm(false)}
        onSaved={(text) => {
          setShowForm(false);
          setNotice(succeeded(text));
          router.refresh();
        }}
      />
    </div>
  );
}
