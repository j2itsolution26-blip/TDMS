import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { ASSESSMENT_KINDS, ASSESSMENT_KIND_LABELS, type AssessmentKind, type GradeWeights } from '@shared/lib/teaching';
import { useAction } from './client-kit';
import { BTN, BTN_SECONDARY, Card, Chip, Field, Flash, INPUT, TD, TH } from './kit';

interface Column {
  id: string;
  kind: AssessmentKind;
  short: string;
  title: string;
  totalPoints: number;
  scoreStatus: string;
}

interface Row {
  studentId: string;
  studentNumber: string;
  name: string;
  status: string;
  statusLabel: string;
  cells: (number | null)[];
  finalGrade: number | null;
  remark: string;
  remarkLabel: string;
  note: string;
}

export interface GradebookData {
  cls: {
    id: string;
    subject: string;
    detail: string;
    schoolYear: string;
    semester: string;
    archived: boolean;
    gradeStatus: string;
    passingGrade: number;
    weights: GradeWeights;
  };
  columns: Column[];
  rows: Row[];
}

const GRADE_LABEL: Record<string, string> = { DRAFT: 'Draft', FINALIZED: 'Finalized', RELEASED: 'Released' };

/**
 * The Instructor Gradebook. A cell is editable while its assessment's results
 * are in draft and the class grades are in draft; the final grade is computed
 * on the server from the class's weights, never typed.
 */
export default function GradebookScreen({ data }: { data: GradebookData }) {
  const { cls, columns, rows } = data;
  const act = useAction();
  const [query, setQuery] = useState('');
  const [remarkFilter, setRemarkFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cells, setCells] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [weightsOpen, setWeightsOpen] = useState(false);
  const gradesOpen = cls.gradeStatus === 'DRAFT' && !cls.archived;
  const editable = (c: Column) => gradesOpen && c.scoreStatus === 'DRAFT';

  const shown = rows.filter(
    (r) =>
      (!query || `${r.name} ${r.studentNumber}`.toLowerCase().includes(query.toLowerCase())) &&
      (!remarkFilter || r.remark === remarkFilter) &&
      (!statusFilter || r.status === statusFilter),
  );
  const studentStatuses = useMemo(() => [...new Map(rows.map((r) => [r.status, r.statusLabel])).entries()], [rows]);
  const dirtyCells = Object.keys(cells).length;
  const dirtyNotes = Object.keys(notes).length;

  async function save() {
    const byAssessment = new Map<string, { studentId: string; points: number | null }[]>();
    for (const [key, v] of Object.entries(cells)) {
      const [assessmentId, studentId] = key.split(':') as [string, string];
      const list = byAssessment.get(assessmentId) ?? [];
      list.push({ studentId, points: v === '' ? null : Number(v) });
      byAssessment.set(assessmentId, list);
    }
    for (const [assessmentId, scores] of byAssessment) {
      const ok = await act.run(() => api.put(`/api/v1/assessments/${assessmentId}/scores`, { scores }), { refresh: false });
      if (ok === null) return;
    }
    if (dirtyNotes > 0) {
      const ok = await act.run(() => api.put(`/api/v1/classes/${cls.id}/grades`, { notes: Object.entries(notes).map(([studentId, note]) => ({ studentId, note: note || null })) }), { refresh: false });
      if (ok === null) return;
    }
    await act.run(async () => ({ ok: true as const, data: true }), { success: 'Grades saved.' });
    setCells({});
    setNotes({});
  }

  async function status(action: 'finalize' | 'release' | 'reopen', confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    await act.run(() => api.post(`/api/v1/classes/${cls.id}/grades/status`, { action }), {
      success: { finalize: 'Grades finalized.', release: 'Grades released — students can now see their final grade.', reopen: 'Grades reopened.' }[action],
    });
  }

  const invalid = Object.entries(cells).some(([key, v]) => {
    if (v === '') return false;
    const col = columns.find((c) => c.id === key.split(':')[0]);
    const n = Number(v);
    return Number.isNaN(n) || n < 0 || (col ? n > col.totalPoints : false);
  });

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 pt-5 lg:flex-row lg:items-center lg:justify-between">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-tdms-muted">Subject</dt><dd className="font-semibold">{cls.subject}</dd></div>
            <div><dt className="text-xs text-tdms-muted">School Year</dt><dd className="font-semibold">{cls.schoolYear.replace('-', '–')}</dd></div>
            <div><dt className="text-xs text-tdms-muted">Semester</dt><dd className="font-semibold">{cls.semester}</dd></div>
            <div><dt className="text-xs text-tdms-muted">Grades</dt><dd><Chip status={cls.gradeStatus} label={GRADE_LABEL[cls.gradeStatus] ?? cls.gradeStatus} /></dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {gradesOpen && <button type="button" className={BTN_SECONDARY} onClick={() => setWeightsOpen(true)}>Weights</button>}
            <a href={`/api/v1/classes/${cls.id}/grades/export`} className={BTN_SECONDARY}><Download className="h-4 w-4" aria-hidden="true" /> Export</a>
            {gradesOpen && <button type="button" className={BTN} disabled={act.busy || (dirtyCells + dirtyNotes === 0) || invalid} onClick={save}>{act.busy ? 'Saving…' : `Save grades${dirtyCells + dirtyNotes ? ` (${dirtyCells + dirtyNotes})` : ''}`}</button>}
            {gradesOpen && <button type="button" className={BTN} disabled={act.busy || dirtyCells + dirtyNotes > 0} onClick={() => status('finalize', 'Finalize grades? Final grades are stored and locked until you reopen them.')}>Finalize grades</button>}
            {cls.gradeStatus === 'FINALIZED' && !cls.archived && <button type="button" className={BTN_SECONDARY} disabled={act.busy} onClick={() => status('reopen')}>Reopen</button>}
            {cls.gradeStatus === 'FINALIZED' && !cls.archived && <button type="button" className={BTN} disabled={act.busy} onClick={() => status('release', 'Release final grades to students? Each student will be notified.')}>Release grades</button>}
          </div>
        </div>
        <p className="mt-3 text-xs text-tdms-muted">
          Weights: {ASSESSMENT_KINDS.map((k) => `${ASSESSMENT_KIND_LABELS[k]} ${cls.weights[k]}%`).join(' · ')} · Passing grade {cls.passingGrade}. Categories with nothing recorded yet are left out of the running grade.
        </p>
        <div className="mt-3 space-y-2">
          {act.notice && <Flash kind="success">{act.notice}</Flash>}
          {act.error && <Flash kind="error">{act.error}</Flash>}
          {invalid && <Flash kind="error">A score is outside its assessment&apos;s total.</Flash>}
        </div>
      </Card>

      <Card padded={false}>
        <div className="grid grid-cols-1 gap-3 px-5 pb-4 pt-5 sm:grid-cols-3 sm:px-6">
          <label><span className="sr-only">Search student</span><input className={INPUT} placeholder="Search student…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <label>
            <span className="sr-only">Filter by remarks</span>
            <select className={INPUT} value={remarkFilter} onChange={(e) => setRemarkFilter(e.target.value)}>
              <option value="">All remarks</option>
              <option value="PASSED">Passed</option>
              <option value="FAILED">Failed</option>
              <option value="INCOMPLETE">Incomplete</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by student status</span>
            <select className={INPUT} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All student statuses</option>
              {studentStatuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto" role="region" aria-label="Gradebook" tabIndex={0}>
          <table className="min-w-full divide-y divide-tdms-hairline">
            <thead className="bg-tdms-bg/60">
              <tr>
                <th scope="col" className={`${TH} sticky left-0 z-10 bg-[#F6F9F8]`}>Student ID</th>
                <th scope="col" className={TH}>Student Name</th>
                {columns.map((c) => (
                  <th key={c.id} scope="col" className={`${TH} text-center`} title={`${c.title} (${c.totalPoints} pts)`}>
                    {c.short}
                    <span className="block text-[10px] font-medium normal-case text-tdms-muted">/{c.totalPoints}{c.scoreStatus !== 'DRAFT' ? ' · locked' : ''}</span>
                  </th>
                ))}
                <th scope="col" className={`${TH} text-center`}>Final Grade</th>
                <th scope="col" className={TH}>Remarks</th>
                <th scope="col" className={TH}>Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tdms-hairline">
              {shown.length === 0 && (
                <tr><td colSpan={columns.length + 5} className={`${TD} text-center text-tdms-muted`}>No students match.</td></tr>
              )}
              {shown.map((r) => (
                <tr key={r.studentId}>
                  <td className={`${TD} sticky left-0 z-10 whitespace-nowrap bg-white tabular-nums`}>{r.studentNumber}</td>
                  <td className={`${TD} whitespace-nowrap font-semibold`}>{r.name}</td>
                  {columns.map((c, i) => {
                    const key = `${c.id}:${r.studentId}`;
                    const value = cells[key] ?? r.cells[i]?.toString() ?? '';
                    return (
                      <td key={c.id} className="px-2 py-2 text-center">
                        {editable(c) ? (
                          <input
                            aria-label={`${c.short} score for ${r.name}`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={c.totalPoints}
                            step="0.5"
                            className={`${INPUT} w-20 py-1 text-center tabular-nums ${cells[key] !== undefined ? 'border-tdms-text bg-tdms-wash' : ''}`}
                            value={value}
                            onChange={(e) => {
                              const original = r.cells[i]?.toString() ?? '';
                              setCells((prev) => {
                                const next = { ...prev };
                                if (e.target.value === original) delete next[key];
                                else next[key] = e.target.value;
                                return next;
                              });
                            }}
                          />
                        ) : (
                          <span className="text-sm tabular-nums">{r.cells[i] ?? '—'}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={`${TD} text-center font-bold tabular-nums`}>{r.finalGrade !== null ? r.finalGrade.toFixed(2) : '—'}</td>
                  <td className={TD}><Chip status={r.remark} label={r.remarkLabel} /></td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Notes for ${r.name}`}
                      className={`${INPUT} min-w-[10rem] py-1 text-xs`}
                      disabled={cls.archived}
                      value={notes[r.studentId] ?? r.note}
                      maxLength={500}
                      onChange={(e) => setNotes({ ...notes, [r.studentId]: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {columns.length === 0 && <p className="px-5 py-4 text-sm text-tdms-muted sm:px-6">No assessments yet. Create quizzes, exams, activities or performance tasks and they appear as columns here.</p>}
      </Card>

      <Modal open={weightsOpen} onClose={() => setWeightsOpen(false)} title="Grade weights">
        <WeightsForm classId={cls.id} weights={cls.weights} onDone={() => setWeightsOpen(false)} />
      </Modal>
    </div>
  );
}

function WeightsForm({ classId, weights, onDone }: { classId: string; weights: GradeWeights; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [w, setW] = useState<Record<AssessmentKind, string>>(Object.fromEntries(ASSESSMENT_KINDS.map((k) => [k, String(weights[k])])) as Record<AssessmentKind, string>);
  const total = ASSESSMENT_KINDS.reduce((s, k) => s + (Number(w[k]) || 0), 0);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() => api.put(`/api/v1/classes/${classId}/weights`, w));
        if (ok) onDone();
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        {ASSESSMENT_KINDS.map((k) => (
          <Field key={k} label={`${ASSESSMENT_KIND_LABELS[k]} (%)`} htmlFor={`w-${k}`} error={errors[k]}>
            <input id={`w-${k}`} type="number" min={0} max={100} className={INPUT} value={w[k]} onChange={(e) => setW({ ...w, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <p className={`text-sm font-semibold ${total === 100 ? 'text-emerald-800' : 'text-red-700'}`}>Total: {total}%{total !== 100 ? ' — must be 100%' : ''}</p>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button>
        <button type="submit" className={BTN} disabled={busy || total !== 100}>Save weights</button>
      </div>
    </form>
  );
}
