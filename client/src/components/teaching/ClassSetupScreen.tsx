import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { DAY_NAMES, SEMESTER_LABELS, yearLevelLabel } from '@shared/lib/teaching';
import { useAction } from './client-kit';
import { BTN, BTN_SECONDARY, BTN_SMALL, Card, Chip, Empty, Field, Flash, INPUT, TD, TH, Table } from './kit';

interface Setup {
  sections: { id: string; name: string; yearLevel: number; label: string; program: { id: string; code: string; name: string }; students: number; classes: number }[];
  classes: {
    id: string;
    semester: number;
    room: string | null;
    passingGrade: number;
    gradeStatus: string;
    instructorId: string | null;
    instructorName: string | null;
    subject: { id: string; code: string; title: string };
    section: { id: string; label: string };
    schedules: { dayOfWeek: number; startTime: string; endTime: string; room: string | null }[];
    scheduleText: string;
  }[];
  programs: { id: string; code: string; name: string }[];
  subjects: { id: string; code: string; title: string }[];
  instructors: { id: string; name: string; email: string }[];
}

type ClassRow = Setup['classes'][number];

/**
 * Classes & Sections — where the Admin and Coordinator build a school year:
 * sections and their rosters, then classes (subject × section × semester)
 * with a Diploma Instructor and a weekly schedule. The instructor assignment
 * is what gives an Instructor access to a class and its students.
 */
export default function ClassSetupScreen({ setup, schoolYearId, archived }: { setup: Setup; schoolYearId: string; archived: boolean }) {
  const [tab, setTab] = useState<'sections' | 'classes'>('classes');
  const act = useAction();
  const [sectionForm, setSectionForm] = useState(false);
  const [roster, setRoster] = useState<string | null>(null);
  const [classForm, setClassForm] = useState<ClassRow | 'new' | null>(null);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Setup" className="inline-flex rounded-xl border border-tdms-hairline bg-white p-1">
        {(['classes', 'sections'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === t ? 'bg-tdms-text text-white' : 'text-tdms-ink hover:bg-tdms-bg'}`}>
            {t === 'classes' ? `Classes (${setup.classes.length})` : `Sections (${setup.sections.length})`}
          </button>
        ))}
      </div>
      {act.notice && <Flash kind="success">{act.notice}</Flash>}
      {act.error && <Flash kind="error">{act.error}</Flash>}

      {tab === 'sections' ? (
        <Card padded={false} title="Sections" description="A program's year level, named, for this school year. Each student is in one section per year." actions={!archived ? <button type="button" className={BTN} onClick={() => setSectionForm(true)}><Plus className="h-4 w-4" aria-hidden="true" /> New section</button> : null}>
          {setup.sections.length === 0 ? (
            <div className="px-5 pb-5 sm:px-6"><Empty title="No sections yet" description="Create a section, add its students, then create its classes." /></div>
          ) : (
            <Table label="Sections" head={<><th scope="col" className={TH}>Section</th><th scope="col" className={TH}>Program</th><th scope="col" className={TH}>Students</th><th scope="col" className={TH}>Classes</th><th scope="col" className={TH}><span className="sr-only">Actions</span></th></>}>
              {setup.sections.map((s) => (
                <tr key={s.id}>
                  <td className={`${TD} font-semibold`}>{s.label}</td>
                  <td className={TD}>{s.program.name}</td>
                  <td className={`${TD} tabular-nums`}>{s.students}</td>
                  <td className={`${TD} tabular-nums`}>{s.classes}</td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    <div className="flex justify-end gap-1.5">
                      <button type="button" className={BTN_SMALL} onClick={() => setRoster(s.id)}>Roster</button>
                      {!archived && s.students === 0 && s.classes === 0 && (
                        <button type="button" className={BTN_SMALL} disabled={act.busy} onClick={() => window.confirm(`Delete section ${s.label}?`) && act.run(() => api.del(`/api/v1/sections/${s.id}`), { success: 'Section deleted.' })}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      ) : (
        <Card padded={false} title="Classes" description="A subject taught to a section in a semester, by a Diploma Instructor." actions={!archived && setup.sections.length > 0 ? <button type="button" className={BTN} onClick={() => setClassForm('new')}><Plus className="h-4 w-4" aria-hidden="true" /> New class</button> : null}>
          {setup.classes.length === 0 ? (
            <div className="px-5 pb-5 sm:px-6"><Empty title="No classes yet" description={setup.sections.length ? 'Create a class for a section.' : 'Create a section first.'} /></div>
          ) : (
            <Table label="Classes" head={<><th scope="col" className={TH}>Subject</th><th scope="col" className={TH}>Section</th><th scope="col" className={TH}>Semester</th><th scope="col" className={TH}>Diploma Instructor</th><th scope="col" className={TH}>Schedule</th><th scope="col" className={TH}>Grades</th><th scope="col" className={TH}><span className="sr-only">Actions</span></th></>}>
              {setup.classes.map((c) => (
                <tr key={c.id}>
                  <td className={TD}><span className="font-semibold">{c.subject.title}</span><span className="block text-xs text-tdms-muted">{c.subject.code}</span></td>
                  <td className={TD}>{c.section.label}</td>
                  <td className={`${TD} whitespace-nowrap`}>{SEMESTER_LABELS[c.semester]}</td>
                  <td className={TD}>{c.instructorName ?? <Chip status="PENDING" label="Unassigned" />}</td>
                  <td className={`${TD} text-[13px]`}>{c.scheduleText || '—'}{c.room ? <span className="block text-xs text-tdms-muted">Room {c.room}</span> : null}</td>
                  <td className={TD}><Chip status={c.gradeStatus} label={c.gradeStatus.charAt(0) + c.gradeStatus.slice(1).toLowerCase()} /></td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    {!archived && (
                      <div className="flex justify-end gap-1.5">
                        <button type="button" className={BTN_SMALL} onClick={() => setClassForm(c)}>Edit</button>
                        <button type="button" className={BTN_SMALL} disabled={act.busy} onClick={() => window.confirm(`Delete ${c.subject.title} for ${c.section.label}? Only a class with no records can be deleted.`) && act.run(() => api.del(`/api/v1/classes/${c.id}`), { success: 'Class deleted.' })}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      <Modal open={sectionForm} onClose={() => setSectionForm(false)} title="New section">
        <SectionForm setup={setup} schoolYearId={schoolYearId} onDone={() => setSectionForm(false)} />
      </Modal>
      <Modal open={roster !== null} onClose={() => setRoster(null)} title="Section roster" maxWidth="sm:max-w-3xl">
        {roster && <RosterEditor sectionId={roster} archived={archived} />}
      </Modal>
      <Modal open={classForm !== null} onClose={() => setClassForm(null)} title={classForm === 'new' ? 'New class' : 'Edit class'} maxWidth="sm:max-w-3xl">
        {classForm !== null && <ClassForm setup={setup} cls={classForm === 'new' ? null : classForm} onDone={() => setClassForm(null)} />}
      </Modal>
    </div>
  );
}

function SectionForm({ setup, schoolYearId, onDone }: { setup: Setup; schoolYearId: string; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [f, setF] = useState({ programId: setup.programs[0]?.id ?? '', yearLevel: '1', name: '' });
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/api/v1/sections', { ...f, schoolYearId }), { success: 'Section created.' })) onDone(); }}>
      <Field label="Program" htmlFor="sec-prog" error={errors.programId}>
        <select id="sec-prog" className={INPUT} value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value })}>
          {setup.programs.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Year level" htmlFor="sec-year" error={errors.yearLevel}>
          <select id="sec-year" className={INPUT} value={f.yearLevel} onChange={(e) => setF({ ...f, yearLevel: e.target.value })}>
            {[1, 2, 3, 4].map((y) => <option key={y} value={y}>{yearLevelLabel(y)}</option>)}
          </select>
        </Field>
        <Field label="Section name" htmlFor="sec-name" error={errors.name}>
          <input id="sec-name" className={INPUT} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="A" required maxLength={50} />
        </Field>
      </div>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button><button type="submit" className={BTN} disabled={busy}>Create</button></div>
    </form>
  );
}

interface RosterData {
  section: { id: string; label: string; yearLevel: number };
  members: { id: string; studentNumber: string; name: string; status: string }[];
  candidates: { id: string; studentNumber: string; name: string; status: string; yearLevel: number | null }[];
}

function RosterEditor({ sectionId, archived }: { sectionId: string; archived: boolean }) {
  const act = useAction();
  const [data, setData] = useState<RosterData | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  async function load() {
    const r = await api.get<RosterData>(`/api/v1/sections/${sectionId}`);
    if (r.ok) setData(r.data);
    else act.setError(r.message);
  }
  useEffect(() => {
    void load();
  }, [sectionId]);

  if (!data) return <p className="text-sm text-tdms-muted">{act.error ?? 'Loading…'}</p>;
  const candidates = data.candidates.filter((c) => !query || `${c.name} ${c.studentNumber}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">{data.section.label} · {data.members.length} students</p>
      {act.notice && <Flash kind="success">{act.notice}</Flash>}
      {act.error && <Flash kind="error">{act.error}</Flash>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section>
          <h3 className="mb-2 text-[13px] font-bold">In this section</h3>
          <ul className="max-h-80 divide-y divide-tdms-hairline overflow-y-auto rounded-xl border border-tdms-hairline">
            {data.members.length === 0 && <li className="px-3 py-3 text-sm text-tdms-muted">No students yet.</li>}
            {data.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span><span className="font-semibold">{m.name}</span> <span className="text-xs text-tdms-muted">{m.studentNumber}</span></span>
                {!archived && (
                  <button type="button" className={BTN_SMALL} aria-label={`Remove ${m.name}`} disabled={act.busy} onClick={async () => { if (await act.run(() => api.del(`/api/v1/sections/${sectionId}/students?studentId=${m.id}`))) void load(); }}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
        {!archived && (
          <section>
            <h3 className="mb-2 text-[13px] font-bold">Add students (not yet in a section this year)</h3>
            <input className={`${INPUT} mb-2`} placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search students to add" />
            <ul className="max-h-64 divide-y divide-tdms-hairline overflow-y-auto rounded-xl border border-tdms-hairline">
              {candidates.length === 0 && <li className="px-3 py-3 text-sm text-tdms-muted">No students available.</li>}
              {candidates.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-tdms-bg">
                    <input type="checkbox" className="rounded border-tdms-hairline text-tdms-text focus:ring-tdms-text" checked={picked.has(c.id)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
                    <span className="min-w-0 flex-1"><span className="font-semibold">{c.name}</span> <span className="text-xs text-tdms-muted">{c.studentNumber}{c.yearLevel ? ` · Year ${c.yearLevel}` : ''}</span></span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`${BTN} mt-3`}
              disabled={act.busy || picked.size === 0}
              onClick={async () => {
                const r = await act.run(() => api.post<{ added: number; skipped: number }>(`/api/v1/sections/${sectionId}/students`, { studentIds: [...picked] }));
                if (r) {
                  act.setNotice(`Added ${r.added} student${r.added === 1 ? '' : 's'}. Their instructors were notified.`);
                  setPicked(new Set());
                  void load();
                }
              }}
            >
              Add {picked.size || ''} to section
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

function ClassForm({ setup, cls, onDone }: { setup: Setup; cls: ClassRow | null; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [f, setF] = useState({
    sectionId: cls?.section.id ?? setup.sections[0]?.id ?? '',
    subjectId: cls?.subject.id ?? setup.subjects[0]?.id ?? '',
    semester: String(cls?.semester ?? 1),
    instructorId: cls?.instructorId ?? '',
    room: cls?.room ?? '',
    passingGrade: String(cls?.passingGrade ?? 75),
  });
  const [schedules, setSchedules] = useState(cls?.schedules.map((s) => ({ ...s, room: s.room ?? '' })) ?? [{ dayOfWeek: 1, startTime: '08:00', endTime: '10:00', room: '' }]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      ...f,
      instructorId: f.instructorId || null,
      room: f.room || null,
      schedules: schedules.map((s) => ({ ...s, room: s.room || null })),
    };
    const ok = cls ? await run(() => api.put(`/api/v1/classes/${cls.id}`, body), { success: 'Class saved.' }) : await run(() => api.post('/api/v1/classes', body), { success: 'Class created.' });
    if (ok) onDone();
  }

  return (
    <form className="space-y-4" onSubmit={save}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Section" htmlFor="c-sec" error={errors.sectionId}>
          <select id="c-sec" className={INPUT} value={f.sectionId} disabled={Boolean(cls)} onChange={(e) => setF({ ...f, sectionId: e.target.value })}>
            {setup.sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Subject" htmlFor="c-sub" error={errors.subjectId}>
          <select id="c-sub" className={INPUT} value={f.subjectId} disabled={Boolean(cls)} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
            {setup.subjects.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.title}</option>)}
          </select>
        </Field>
        <Field label="Semester" htmlFor="c-sem" error={errors.semester}>
          <select id="c-sem" className={INPUT} value={f.semester} disabled={Boolean(cls)} onChange={(e) => setF({ ...f, semester: e.target.value })}>
            {[1, 2, 3].map((s) => <option key={s} value={s}>{SEMESTER_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="Diploma Instructor" htmlFor="c-inst" error={errors.instructorId} className="sm:col-span-2">
          <select id="c-inst" className={INPUT} value={f.instructorId} onChange={(e) => setF({ ...f, instructorId: e.target.value })}>
            <option value="">Unassigned</option>
            {setup.instructors.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
          </select>
        </Field>
        <Field label="Passing grade" htmlFor="c-pass" error={errors.passingGrade}>
          <input id="c-pass" type="number" min={0} max={100} className={INPUT} value={f.passingGrade} onChange={(e) => setF({ ...f, passingGrade: e.target.value })} />
        </Field>
        <Field label="Room" htmlFor="c-room" error={errors.room}>
          <input id="c-room" className={INPUT} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} maxLength={50} />
        </Field>
      </div>
      <fieldset className="rounded-xl border border-tdms-hairline p-4">
        <legend className="px-1 text-[13px] font-semibold">Weekly schedule</legend>
        <ul className="space-y-2">
          {schedules.map((s, i) => (
            <li key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-5">
              <label className="text-xs font-semibold">Day
                <select className={INPUT} value={s.dayOfWeek} onChange={(e) => setSchedules(schedules.map((x, j) => (j === i ? { ...x, dayOfWeek: Number(e.target.value) } : x)))}>
                  {DAY_NAMES.map((d, n) => <option key={d} value={n}>{d}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold">Start<input type="time" className={INPUT} value={s.startTime} onChange={(e) => setSchedules(schedules.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} required /></label>
              <label className="text-xs font-semibold">End<input type="time" className={INPUT} value={s.endTime} onChange={(e) => setSchedules(schedules.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)))} required /></label>
              <label className="text-xs font-semibold">Room<input className={INPUT} value={s.room} onChange={(e) => setSchedules(schedules.map((x, j) => (j === i ? { ...x, room: e.target.value } : x)))} placeholder="Same" /></label>
              <button type="button" className={BTN_SMALL} onClick={() => setSchedules(schedules.filter((_, j) => j !== i))} aria-label="Remove meeting"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove</button>
            </li>
          ))}
        </ul>
        <button type="button" className={`${BTN_SMALL} mt-3`} onClick={() => setSchedules([...schedules, { dayOfWeek: 1, startTime: '08:00', endTime: '10:00', room: '' }])}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add meeting</button>
        {Object.keys(errors).some((k) => k.startsWith('schedules')) && <p className="mt-2 text-xs text-red-700">Each meeting must end after it starts.</p>}
      </fieldset>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button><button type="submit" className={BTN} disabled={busy}>{busy ? 'Saving…' : 'Save class'}</button></div>
    </form>
  );
}
