import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { SECTION_YEAR_LEVELS, SEMESTER_LABELS, yearLevelLabel } from '@shared/lib/teaching';
import { ClassForm, RoomsPanel, Timetable, type ClassRow, type ScheduleSetup } from './ClassSchedule';
import { useAction } from './client-kit';
import SectionRoster from './SectionRoster';
import SectionsManagement, { useSectionScope } from './SectionsManagement';
import { useRouter } from '@/lib/navigation';
import { BTN, BTN_SECONDARY, BTN_SMALL, Card, Chip, Empty, Field, Flash, INPUT, TD, TH, Table } from './kit';

interface Setup extends ScheduleSetup {
  sections: (ScheduleSetup['sections'][number] & { students: number; classes: number })[];
  programs: { id: string; code: string; name: string }[];
}

/**
 * Classes & Sections — where the Admin and Coordinator build a school year:
 * sections and their rosters, then classes (subject × section × semester)
 * with a Diploma Instructor and a weekly schedule. The instructor assignment
 * is what gives an Instructor access to a class and its students.
 *
 * Classes are scheduled from the curriculum map (only subjects mapped to the
 * section's program, year level and semester), into rooms, and checked for
 * room, instructor and section conflicts by the server. The Timetable shows
 * the week by section, room or instructor; Rooms lists where classes meet.
 * Read-only for the Director (and for an archived year).
 */
export type SetupTab = 'sections' | 'classes' | 'timetable' | 'rooms';
const TAB_LABELS: Record<SetupTab, string> = { classes: 'Classes', sections: 'Sections', timetable: 'Timetable', rooms: 'Rooms' };

export default function ClassSetupScreen({ setup, schoolYearId, yearLabel, archived: yearArchived, canManage, tab, onTab, newSection }: {
  setup: Setup;
  schoolYearId: string;
  yearLabel: string;
  archived: boolean;
  /** False for the Director: everything is shown, nothing can be changed. */
  canManage: boolean;
  /** The open tab lives in the URL (?tab=), so the page header can follow it. */
  tab: SetupTab;
  onTab: (tab: SetupTab) => void;
  /** Bumped by the page header's New Section button. */
  newSection: number;
}) {
  const act = useAction();
  const router = useRouter();
  // Read-only: an archived year, or a viewer who may not manage classes.
  const archived = yearArchived || !canManage;
  // Which program and year level the Sections tab shows (kept in the URL).
  const scope = useSectionScope(setup.sections, setup.programs);
  // The New Section form, open with its program and year level preselected.
  const [sectionForm, setSectionForm] = useState<{ programId: string | null; yearLevel: number } | null>(null);
  // A success message that clears itself, like a toast.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const announce = (message: string) => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 5000); };
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => { if (newSection > 0 && !archived) setSectionForm({ programId: scope.programId, yearLevel: scope.level }); }, [newSection, archived]); // eslint-disable-line react-hooks/exhaustive-deps
  const [roster, setRoster] = useState<string | null>(null);
  const [classForm, setClassForm] = useState<ClassRow | 'new' | null>(null);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Setup" className="inline-flex rounded-xl border border-tdms-hairline bg-white p-1">
        {(['classes', 'sections', 'timetable', 'rooms'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => onTab(t)} className={`rounded-lg px-3 py-2 text-sm font-semibold sm:px-4 ${tab === t ? 'bg-tdms-text text-white' : 'text-tdms-ink hover:bg-tdms-bg'}`}>
            {TAB_LABELS[t]}{t === 'classes' ? ` (${setup.classes.length})` : t === 'sections' ? ` (${setup.sections.length})` : t === 'rooms' ? ` (${setup.rooms.length})` : ''}
          </button>
        ))}
      </div>
      {toast && <div className="fixed bottom-5 right-5 z-40 max-w-sm" role="status"><Flash kind="success">{toast}</Flash></div>}
      {act.notice && <Flash kind="success">{act.notice}</Flash>}
      {act.error && <Flash kind="error">{act.error}</Flash>}

      {!canManage && <p className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-700 ring-1 ring-inset ring-slate-200">View only — the Coordinator and Admin schedule classes and manage sections.</p>}
      {tab === 'timetable' ? <Timetable setup={setup} /> : tab === 'rooms' ? <RoomsPanel rooms={setup.rooms} readOnly={archived} /> : tab === 'sections' ? (
        <SectionsManagement
          sections={setup.sections}
          scope={scope}
          archived={archived}
          yearLabel={yearLabel}
          onStudents={(id) => setRoster(id)}
          onNewSection={(programId, yearLevel) => setSectionForm({ programId, yearLevel })}
          onChanged={(message) => { announce(message); router.refresh(); }}
        />
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
                  <td className={`${TD} text-[13px]`}>
                    {c.scheduleText || '—'}
                    {(c.roomCode || c.room) && <span className="block text-xs text-tdms-muted">Room {c.roomCode ?? c.room}</span>}
                    {c.status === 'CANCELLED' && <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase text-slate-600 ring-1 ring-inset ring-slate-200">Cancelled</span>}
                    {!c.mapped && <span className="mt-0.5 block text-[11px] text-amber-800">Not linked to the curriculum</span>}
                  </td>
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

      <Modal open={sectionForm !== null} onClose={() => setSectionForm(null)} title="New section" subtitle={`School year ${yearLabel}`}>
        {sectionForm && (
          <SectionForm setup={setup} schoolYearId={schoolYearId} defaults={sectionForm} onDone={(created) => {
            setSectionForm(null);
            if (!created) return;
            // Show the year level the new section was created in.
            scope.show(created.programId, created.yearLevel);
            announce(`Section ${created.name} created.`);
          }} />
        )}
      </Modal>
      <Modal open={roster !== null} onClose={() => setRoster(null)} title="Section Roster" subtitle="Students placed in this section for the school year." maxWidth="sm:max-w-[1040px]" appearance="fluent">
        {roster && <SectionRoster sectionId={roster} archived={archived} />}
      </Modal>
      <Modal open={classForm !== null} onClose={() => setClassForm(null)} title={classForm === 'new' ? 'New class' : 'Edit class'} maxWidth="sm:max-w-3xl">
        {classForm !== null && <ClassForm setup={setup} cls={classForm === 'new' ? null : classForm} onDone={(message) => { setClassForm(null); if (message) announce(message); }} />}
      </Modal>
    </div>
  );
}

function SectionForm({ setup, schoolYearId, defaults, onDone }: {
  setup: Setup;
  schoolYearId: string;
  defaults: { programId: string | null; yearLevel: number };
  onDone: (created?: { name: string; programId: string; yearLevel: number }) => void;
}) {
  const { busy, error, errors, run } = useAction();
  const [f, setF] = useState({
    programId: setup.programs.some((p) => p.id === defaults.programId) ? defaults.programId! : setup.programs[0]?.id ?? '',
    yearLevel: String(defaults.yearLevel),
    name: '',
  });
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/api/v1/sections', { ...f, schoolYearId }), { success: 'Section created.' })) onDone({ name: f.name.trim(), programId: f.programId, yearLevel: Number(f.yearLevel) }); }}>
      <Field label="Program" htmlFor="sec-prog" error={errors.programId}>
        <select id="sec-prog" className={INPUT} value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value })}>
          {setup.programs.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Year level" htmlFor="sec-year" error={errors.yearLevel}>
          <select id="sec-year" className={INPUT} value={f.yearLevel} onChange={(e) => setF({ ...f, yearLevel: e.target.value })}>
            {SECTION_YEAR_LEVELS.map((y) => <option key={y} value={y}>{yearLevelLabel(y)}</option>)}
          </select>
        </Field>
        <Field label="Section name" htmlFor="sec-name" error={errors.name}>
          <input id="sec-name" className={INPUT} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="A" required maxLength={50} autoFocus />
        </Field>
      </div>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={() => onDone()}>Cancel</button><button type="submit" className={BTN} disabled={busy}>Create</button></div>
    </form>
  );
}
