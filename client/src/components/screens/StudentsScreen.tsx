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
export interface CurriculumOption { id: string; versionLabel: string; effectiveSchoolYear: string; isActive?: boolean }

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

export default function StudentsScreen({
  rows, page, lastPage, total, search, programs, canCreate, canUpdate,
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

      {notice && <Alert type={notice.tone}>{notice.text}</Alert>}

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

      <StudentFormModal
        open={showForm}
        editing={editing}
        programs={programs}
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
