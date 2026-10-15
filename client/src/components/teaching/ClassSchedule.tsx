import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useRouter } from '@/lib/navigation';
import { DAY_NAMES, DAY_SHORT, SEMESTER_LABELS, formatClock, timeToMinutes, yearLevelLabel } from '@shared/lib/teaching';
import { useAction } from './client-kit';
import { BTN, BTN_SECONDARY, BTN_SMALL, Field, Flash, FOCUS, INPUT } from './kit';

/**
 * Class scheduling on the Classes & Sections screen:
 *
 *   * ClassForm — a class for a section: only subjects mapped to the
 *     section's program, year level and semester; an active instructor and
 *     room; weekly meetings. While it is filled in, the server's dry run
 *     (POST /classes/check) lists the room, instructor and section conflicts;
 *     saving re-checks under the term lock, so the form never has the last word.
 *   * Timetable — the week as a grid, by section, room or instructor.
 *   * RoomsPanel — the rooms classes are booked into.
 */

export interface Room { id: string; code: string; name: string; type: string; capacity: number | null; isActive: boolean }
export interface Mapping { programId: string; curriculum: string; subjectId: string; yearLevel: number; semester: number; units: number; isRequired: boolean }
export interface MeetingRow { dayOfWeek: number; startTime: string; endTime: string; room: string | null; roomId: string | null; roomCode: string | null }
export interface ClassRow {
  id: string;
  semester: number;
  room: string | null;
  roomId: string | null;
  roomCode: string | null;
  status: string;
  mapped: boolean;
  passingGrade: number;
  gradeStatus: string;
  instructorId: string | null;
  instructorName: string | null;
  subject: { id: string; code: string; title: string };
  section: { id: string; label: string; programId: string; yearLevel: number };
  schedules: MeetingRow[];
  scheduleText: string;
}
export interface ScheduleSetup {
  sections: { id: string; name: string; yearLevel: number; label: string; program: { id: string; code: string; name: string } }[];
  classes: ClassRow[];
  subjects: { id: string; code: string; title: string }[];
  instructors: { id: string; name: string; email: string }[];
  rooms: Room[];
  mappings: Mapping[];
}

interface Conflict { kind: 'room' | 'instructor' | 'section' | 'self'; meeting: number; message: string }
type Meeting = { dayOfWeek: number; startTime: string; endTime: string; roomId: string };

const KIND_LABEL: Record<Conflict['kind'], string> = { room: 'Room', instructor: 'Instructor', section: 'Section', self: 'Overlap' };

export function ClassForm({ setup, cls, onDone }: { setup: ScheduleSetup; cls: ClassRow | null; onDone: (message?: string) => void }) {
  const { busy, error, errors, run } = useAction();
  const [f, setF] = useState({
    sectionId: cls?.section.id ?? setup.sections[0]?.id ?? '',
    subjectId: cls?.subject.id ?? '',
    semester: String(cls?.semester ?? 1),
    instructorId: cls?.instructorId ?? '',
    roomId: cls?.roomId ?? '',
    passingGrade: String(cls?.passingGrade ?? 75),
    status: cls?.status ?? 'ACTIVE',
  });
  const [meetings, setMeetings] = useState<Meeting[]>(cls?.schedules.map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, roomId: s.roomId ?? '' })) ?? [{ dayOfWeek: 1, startTime: '08:00', endTime: '10:00', roomId: '' }]);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [checking, setChecking] = useState(false);

  const section = setup.sections.find((s) => s.id === f.sectionId);
  // Only what the section's program teaches at its year level in this semester.
  const offered = useMemo(() => {
    if (!section) return [];
    const ids = new Set(setup.mappings.filter((m) => m.programId === section.program.id && m.yearLevel === section.yearLevel && m.semester === Number(f.semester)).map((m) => m.subjectId));
    return setup.subjects.filter((s) => ids.has(s.id));
  }, [section, f.semester, setup.mappings, setup.subjects]);
  useEffect(() => {
    if (!cls && f.subjectId && !offered.some((s) => s.id === f.subjectId)) setF((x) => ({ ...x, subjectId: '' }));
  }, [offered, cls, f.subjectId]);

  const activeRooms = setup.rooms.filter((r) => r.isActive || r.id === f.roomId || meetings.some((m) => m.roomId === r.id));
  const badTimes = meetings.some((m) => timeToMinutes(m.endTime) <= timeToMinutes(m.startTime));

  // The dry run, debounced, whenever what decides a conflict changes.
  const seq = useRef(0);
  useEffect(() => {
    if (f.status === 'CANCELLED' || badTimes || meetings.length === 0 || (!cls && !f.sectionId)) { setConflicts(null); return; }
    const mine = ++seq.current;
    setChecking(true);
    const t = setTimeout(async () => {
      const r = await api.post<{ conflicts: Conflict[] }>('/api/v1/classes/check', {
        classId: cls?.id ?? null,
        sectionId: cls ? null : f.sectionId,
        semester: cls ? null : Number(f.semester),
        instructorId: f.instructorId || null,
        roomId: f.roomId || null,
        schedules: meetings.map((m) => ({ ...m, roomId: m.roomId || null })),
      });
      if (mine !== seq.current) return;
      setChecking(false);
      setConflicts(r.ok ? r.data.conflicts : null);
    }, 400);
    return () => clearTimeout(t);
  }, [cls, f.sectionId, f.semester, f.instructorId, f.roomId, f.status, meetings, badTimes]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      ...f,
      instructorId: f.instructorId || null,
      roomId: f.roomId || null,
      schedules: meetings.map((m) => ({ ...m, roomId: m.roomId || null })),
    };
    const subject = setup.subjects.find((s) => s.id === f.subjectId);
    const ok = cls
      ? await run(() => api.put(`/api/v1/classes/${cls.id}`, body), { success: 'Class saved.' })
      : await run(() => api.post('/api/v1/classes', body), { success: 'Class created.' });
    if (ok) onDone(cls ? `${cls.subject.code} for ${cls.section.label} was saved.` : `${subject?.code ?? 'The class'} was scheduled for ${section?.label}.`);
  }

  const meetingConflicts = (i: number) => conflicts?.filter((c) => c.meeting === i) ?? [];
  const blocking = (conflicts?.length ?? 0) > 0;

  return (
    <form className="space-y-4" onSubmit={save}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Section" htmlFor="c-sec" error={errors.sectionId}>
          <select id="c-sec" className={INPUT} value={f.sectionId} disabled={Boolean(cls)} onChange={(e) => setF({ ...f, sectionId: e.target.value })}>
            {setup.sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Semester" htmlFor="c-sem" error={errors.semester}>
          <select id="c-sem" className={INPUT} value={f.semester} disabled={Boolean(cls)} onChange={(e) => setF({ ...f, semester: e.target.value })}>
            {[1, 2, 3].map((s) => <option key={s} value={s}>{SEMESTER_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="Subject" htmlFor="c-sub" error={errors.subjectId}>
          <select id="c-sub" className={INPUT} value={f.subjectId} disabled={Boolean(cls)} required onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
            {cls ? <option value={cls.subject.id}>{cls.subject.code} — {cls.subject.title}</option> : (
              <>
                <option value="">{offered.length ? 'Choose a subject…' : 'No subject mapped to this term'}</option>
                {offered.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.title}</option>)}
              </>
            )}
          </select>
        </Field>
      </div>
      {!cls && section && offered.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          {section.program.code}’s curriculum has no subject for {yearLevelLabel(section.yearLevel)} · {SEMESTER_LABELS[Number(f.semester)]}. Map subjects under Subjects → Curriculum Map first.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Diploma Instructor" htmlFor="c-inst" error={errors.instructorId} className="sm:col-span-2">
          <select id="c-inst" className={INPUT} value={f.instructorId} onChange={(e) => setF({ ...f, instructorId: e.target.value })}>
            <option value="">Unassigned</option>
            {setup.instructors.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
          </select>
        </Field>
        <Field label="Room" htmlFor="c-room" error={errors.roomId}>
          <select id="c-room" className={INPUT} value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
            <option value="">No room</option>
            {activeRooms.map((r) => <option key={r.id} value={r.id} disabled={!r.isActive}>{r.code} — {r.name}{r.isActive ? '' : ' (inactive)'}</option>)}
          </select>
        </Field>
        <Field label="Passing grade" htmlFor="c-pass" error={errors.passingGrade}>
          <input id="c-pass" type="number" min={0} max={100} className={INPUT} value={f.passingGrade} onChange={(e) => setF({ ...f, passingGrade: e.target.value })} />
        </Field>
        {cls && (
          <Field label="Status" htmlFor="c-status" error={errors.status}>
            <select id="c-status" className={INPUT} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="ACTIVE">Active</option>
              <option value="CANCELLED">Cancelled — frees its room and times</option>
            </select>
          </Field>
        )}
      </div>

      <fieldset className="rounded-xl border border-tdms-hairline p-4">
        <legend className="px-1 text-[13px] font-semibold">Weekly meetings</legend>
        <ul className="space-y-3">
          {meetings.map((m, i) => {
            const mc = meetingConflicts(i);
            const late = timeToMinutes(m.endTime) <= timeToMinutes(m.startTime);
            return (
              <li key={i} className={`rounded-lg p-2 ${mc.length || late ? 'bg-red-50/60 ring-1 ring-inset ring-red-200' : ''}`}>
                <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-5">
                  <label className="text-xs font-semibold">Day
                    <select className={INPUT} value={m.dayOfWeek} onChange={(e) => setMeetings(meetings.map((x, j) => (j === i ? { ...x, dayOfWeek: Number(e.target.value) } : x)))}>
                      {DAY_NAMES.map((d, n) => <option key={d} value={n}>{d}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold">Start<input type="time" className={INPUT} value={m.startTime} onChange={(e) => setMeetings(meetings.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} required /></label>
                  <label className="text-xs font-semibold">End<input type="time" className={INPUT} value={m.endTime} onChange={(e) => setMeetings(meetings.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)))} required aria-invalid={late || undefined} /></label>
                  <label className="text-xs font-semibold">Room
                    <select className={INPUT} value={m.roomId} onChange={(e) => setMeetings(meetings.map((x, j) => (j === i ? { ...x, roomId: e.target.value } : x)))}>
                      <option value="">Same as class</option>
                      {activeRooms.map((r) => <option key={r.id} value={r.id} disabled={!r.isActive}>{r.code}</option>)}
                    </select>
                  </label>
                  <button type="button" className={BTN_SMALL} onClick={() => setMeetings(meetings.filter((_, j) => j !== i))} aria-label={`Remove meeting ${i + 1}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove</button>
                </div>
                {late && <p className="mt-1.5 text-xs font-medium text-red-700">The meeting must end after it starts.</p>}
                {mc.map((c, k) => (
                  <p key={k} className="mt-1.5 flex gap-1.5 text-xs text-red-800"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span><b>{KIND_LABEL[c.kind]}:</b> {c.message}</span></p>
                ))}
              </li>
            );
          })}
        </ul>
        <button type="button" className={`${BTN_SMALL} mt-3`} onClick={() => setMeetings([...meetings, { dayOfWeek: 1, startTime: '08:00', endTime: '10:00', roomId: '' }])}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add meeting</button>
        <p className="mt-3 text-xs" aria-live="polite">
          {f.status === 'CANCELLED' ? <span className="text-muted">A cancelled class is not checked for conflicts.</span>
            : checking ? <span className="text-muted">Checking rooms, instructor and section…</span>
              : conflicts && conflicts.length === 0 ? <span className="inline-flex items-center gap-1 font-medium text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> No conflicts with other classes this term.</span>
                : blocking ? <span className="font-medium text-red-800">{conflicts!.length} conflict{conflicts!.length === 1 ? '' : 's'} — change the time, room or instructor.</span> : null}
        </p>
        {Object.keys(errors).some((k) => k.startsWith('schedules')) && <p className="mt-1 text-xs text-red-700">{Object.entries(errors).filter(([k]) => k.startsWith('schedules')).flatMap(([, v]) => v).join(' ')}</p>}
      </fieldset>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={() => onDone()}>Cancel</button>
        <button type="submit" className={BTN} disabled={busy || badTimes || blocking}>{busy ? 'Saving…' : cls ? 'Save class' : 'Schedule class'}</button>
      </div>
    </form>
  );
}

// --- Timetable ---------------------------------------------------------------------------------

const DAYS = [1, 2, 3, 4, 5, 6];
// The timetable's filters sit in a row: the form input style without its full width.
const TT_SELECT = 'block w-full rounded-xl border-tdms-hairline text-sm text-tdms-ink shadow-sm focus:border-tdms-text focus:ring-tdms-text sm:w-auto';
const PALETTE = ['bg-emerald-50 ring-emerald-200 text-emerald-900', 'bg-sky-50 ring-sky-200 text-sky-900', 'bg-violet-50 ring-violet-200 text-violet-900', 'bg-amber-50 ring-amber-200 text-amber-900', 'bg-rose-50 ring-rose-200 text-rose-900', 'bg-teal-50 ring-teal-200 text-teal-900'];

export function Timetable({ setup }: { setup: ScheduleSetup }) {
  const [by, setBy] = useState<'section' | 'room' | 'instructor'>('section');
  const [semester, setSemester] = useState(1);
  const options = by === 'section' ? setup.sections.map((s) => ({ id: s.id, label: s.label }))
    : by === 'room' ? setup.rooms.map((r) => ({ id: r.id, label: `${r.code} — ${r.name}` }))
      : setup.instructors.map((u) => ({ id: u.id, label: u.name }));
  const [pick, setPick] = useState('');
  const chosen = options.find((o) => o.id === pick)?.id ?? options[0]?.id ?? '';

  const blocks = setup.classes
    .filter((c) => c.status === 'ACTIVE' && c.semester === semester)
    .flatMap((c) => c.schedules.map((m) => ({ c, m, roomId: m.roomId ?? c.roomId, roomCode: m.roomCode ?? c.roomCode })))
    .filter(({ c, roomId }) => (by === 'section' ? c.section.id === chosen : by === 'room' ? roomId === chosen : c.instructorId === chosen));
  // Overlapping blocks in this view are flagged (they should not exist; legacy data might).
  const clash = (b: (typeof blocks)[number]) => blocks.some((o) => o !== b && o.m.dayOfWeek === b.m.dayOfWeek && timeToMinutes(o.m.startTime) < timeToMinutes(b.m.endTime) && timeToMinutes(b.m.startTime) < timeToMinutes(o.m.endTime));
  const colour = new Map<string, string>();
  for (const b of blocks) if (!colour.has(b.c.subject.id)) colour.set(b.c.subject.id, PALETTE[colour.size % PALETTE.length]!);

  const start = Math.min(7 * 60, ...blocks.map((b) => timeToMinutes(b.m.startTime)));
  const end = Math.max(18 * 60, ...blocks.map((b) => timeToMinutes(b.m.endTime)));
  const hours = Array.from({ length: Math.ceil((end - start) / 60) }, (_, i) => start + i * 60);
  const px = 56; // per hour

  return (
    <section aria-labelledby="tt-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="tt-heading" className="text-base font-semibold text-ink">Timetable</h2>
          <p className="text-xs text-muted">Active classes, by {by}, for {SEMESTER_LABELS[semester]}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="tt-by">View by</label>
          <select id="tt-by" className={TT_SELECT} value={by} onChange={(e) => { setBy(e.target.value as typeof by); setPick(''); }}>
            <option value="section">By section</option><option value="room">By room</option><option value="instructor">By instructor</option>
          </select>
          <label className="sr-only" htmlFor="tt-pick">{by}</label>
          <select id="tt-pick" className={`${TT_SELECT} max-w-[18rem]`} value={chosen} onChange={(e) => setPick(e.target.value)} disabled={options.length === 0}>
            {options.length === 0 ? <option>None yet</option> : options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="tt-sem">Semester</label>
          <select id="tt-sem" className={TT_SELECT} value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
            {[1, 2, 3].map((s) => <option key={s} value={s}>{SEMESTER_LABELS[s]}</option>)}
          </select>
        </div>
      </div>

      {blocks.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-muted">Nothing scheduled here for {SEMESTER_LABELS[semester]}.</p>
      ) : (
        <>
          {/* Phones: one list per day. */}
          <ol className="mt-4 space-y-3 md:hidden">
            {DAYS.concat(0).filter((d) => blocks.some((b) => b.m.dayOfWeek === d)).map((d) => (
              <li key={d}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{DAY_NAMES[d]}</p>
                <ul className="mt-1 space-y-1.5">
                  {blocks.filter((b) => b.m.dayOfWeek === d).sort((a, b) => a.m.startTime.localeCompare(b.m.startTime)).map((b, i) => (
                    <li key={i} className={`rounded-lg px-3 py-2 text-sm ring-1 ring-inset ${clash(b) ? 'bg-red-50 text-red-900 ring-red-300' : colour.get(b.c.subject.id)}`}>
                      <b>{formatClock(b.m.startTime)}–{formatClock(b.m.endTime)}</b> · {b.c.subject.code} · {by === 'section' ? (b.roomCode ?? 'No room') : b.c.section.label}{clash(b) ? ' · Conflict' : ''}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          {/* Wider screens: the week grid. */}
          <div className="relative mt-4 hidden overflow-x-auto md:block" role="region" aria-label="Weekly timetable" tabIndex={0}>
            <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `56px repeat(${DAYS.length}, minmax(0, 1fr))` }}>
              <div />
              {DAYS.map((d) => <div key={d} className="border-b border-slate-200 pb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted">{DAY_SHORT[d]}</div>)}
              <div className="relative" style={{ height: hours.length * px }}>
                {hours.map((h, i) => <span key={h} className="absolute right-2 text-[11px] text-muted" style={{ top: i * px - 6 }}>{formatClock(`${String(Math.floor(h / 60)).padStart(2, '0')}:00`)}</span>)}
              </div>
              {DAYS.map((d) => (
                <div key={d} className="relative border-l border-slate-100" style={{ height: hours.length * px }}>
                  {hours.map((h, i) => <div key={h} className="absolute inset-x-0 border-t border-slate-100" style={{ top: i * px }} />)}
                  {blocks.filter((b) => b.m.dayOfWeek === d).map((b, i) => {
                    const top = ((timeToMinutes(b.m.startTime) - start) / 60) * px;
                    const height = Math.max(22, ((timeToMinutes(b.m.endTime) - timeToMinutes(b.m.startTime)) / 60) * px - 2);
                    const bad = clash(b);
                    return (
                      <div key={i} className={`absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-[11px] leading-tight ring-1 ring-inset ${bad ? 'bg-red-50 text-red-900 ring-red-300' : colour.get(b.c.subject.id)}`} style={{ top, height }}
                        title={`${b.c.subject.code} · ${b.c.section.label} · ${formatClock(b.m.startTime)}–${formatClock(b.m.endTime)}${b.roomCode ? ` · ${b.roomCode}` : ''}${b.c.instructorName ? ` · ${b.c.instructorName}` : ''}`}>
                        <p className="font-semibold">{b.c.subject.code}{bad ? ' · Conflict' : ''}</p>
                        <p>{formatClock(b.m.startTime)}–{formatClock(b.m.endTime)}</p>
                        <p className="truncate">{by === 'room' ? b.c.section.label : b.roomCode ?? 'No room'}</p>
                        {by !== 'instructor' && <p className="truncate">{b.c.instructorName ?? 'Unassigned'}</p>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {blocks.some((b) => b.m.dayOfWeek === 0) && <p className="mt-2 text-xs text-muted">Sunday meetings are listed on phones and in the class list.</p>}
        </>
      )}
    </section>
  );
}

// --- Rooms -------------------------------------------------------------------------------------

export function RoomsPanel({ rooms, readOnly }: { rooms: Room[]; readOnly: boolean }) {
  const router = useRouter();
  const { busy, error, errors, notice, run } = useAction();
  const [editing, setEditing] = useState<Room | 'new' | null>(null);
  const [f, setF] = useState({ code: '', name: '', type: 'LECTURE', capacity: '', isActive: true });

  function open(r: Room | 'new') {
    setEditing(r);
    setF(r === 'new' ? { code: '', name: '', type: 'LECTURE', capacity: '', isActive: true } : { code: r.code, name: r.name, type: r.type, capacity: r.capacity ? String(r.capacity) : '', isActive: r.isActive });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...f, capacity: f.capacity ? Number(f.capacity) : null };
    const ok = editing === 'new'
      ? await run(() => api.post('/api/v1/rooms', body), { success: `Room ${f.code.toUpperCase()} added.` })
      : await run(() => api.put(`/api/v1/rooms/${(editing as Room).id}`, body), { success: `Room ${f.code.toUpperCase()} saved.` });
    if (ok) { setEditing(null); router.refresh(); }
  }

  return (
    <section aria-labelledby="rooms-heading" className="rounded-2xl border border-slate-200 bg-white shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
        <div>
          <h2 id="rooms-heading" className="text-base font-semibold text-ink">Rooms</h2>
          <p className="text-xs text-muted">Classrooms and laboratories. Deactivate a room to stop new bookings; past schedules keep it.</p>
        </div>
        {!readOnly && <button type="button" className={BTN} onClick={() => open('new')}><Plus className="h-4 w-4" aria-hidden="true" /> New room</button>}
      </header>
      {notice && <div className="px-4 pt-3 sm:px-5"><Flash kind="success">{notice}</Flash></div>}
      {rooms.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-muted">No rooms yet. Add the classrooms and laboratories classes are held in.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rooms.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{r.code} <span className="font-normal text-muted">·</span> {r.name}</p>
                <p className="text-xs text-muted">{r.type === 'LABORATORY' ? 'Laboratory' : r.type === 'LECTURE' ? 'Lecture room' : 'Other'}{r.capacity ? ` · seats ${r.capacity}` : ''}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${r.isActive ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>{r.isActive ? 'Active' : 'Inactive'}</span>
              {!readOnly && <button type="button" className={BTN_SMALL} onClick={() => open(r)} aria-label={`Edit room ${r.code}`}>Edit</button>}
            </li>
          ))}
        </ul>
      )}
      {editing !== null && (
        <form onSubmit={save} className="space-y-3 border-t border-slate-200 px-4 py-4 sm:px-5" aria-label={editing === 'new' ? 'New room' : `Edit room ${(editing as Room).code}`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Code" htmlFor="rm-code" error={errors.code}><input id="rm-code" className={INPUT} value={f.code} maxLength={30} required onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
            <Field label="Name" htmlFor="rm-name" error={errors.name} className="sm:col-span-2"><input id="rm-name" className={INPUT} value={f.name} maxLength={120} required onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Type" htmlFor="rm-type" error={errors.type}>
              <select id="rm-type" className={INPUT} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                <option value="LECTURE">Lecture room</option><option value="LABORATORY">Laboratory</option><option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Seats" htmlFor="rm-cap" error={errors.capacity}><input id="rm-cap" type="number" min={1} max={500} className={INPUT} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink sm:col-span-3">
              <input type="checkbox" className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Active (can be booked)
            </label>
          </div>
          {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className={BTN} disabled={busy}>{busy ? 'Saving…' : 'Save room'}</button>
          </div>
        </form>
      )}
    </section>
  );
}

export { FOCUS };
