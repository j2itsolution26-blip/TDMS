import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useRouter } from '@/lib/navigation';
import { useOpenOnNew } from '@/lib/use-open-on-new';
import { api } from '@/lib/api-client';
import Modal from '@/components/Modal';
import { Card, EmptyState, Pagination, INPUT_CLASS, BUTTON_SECONDARY } from '@/components/ui';
import { FOCUS, PageShell } from '@/components/teaching/kit';
import { SUBJECT_TYPE_LABELS, type SubjectType } from '@shared/types/domain';
import { SEMESTER_LABELS, yearLevelLabel } from '@shared/lib/teaching';
import { totalHours } from '@shared/lib/subjects';
import CurriculumMap, { readMapScope, type ActiveSubject, type MapProgram } from './CurriculumMap';
import SubjectForm, { type SubjectDetails } from './SubjectForm';

/**
 * Subjects Management — Program → Year Level → Semester → Subjects.
 *
 * Two views of one catalogue: the Curriculum Map (where each subject is
 * taught, by program, year level and semester) and the Catalogue (every
 * subject record, mapped or not, with where it is used). A subject is one
 * record however many curricula use it. New Subject places it in the term
 * being viewed. Changes go through the catalogue and curriculum endpoints,
 * which validate and authorize every one.
 */

export interface SubjectRow extends SubjectDetails {
  /** Where it is mapped, in active curricula. */
  usage: { program: string; curriculum: string; yearLevel: number; semester: number }[];
}

interface Props {
  rows: SubjectRow[];
  page: number;
  lastPage: number;
  total: number;
  search: string;
  map: MapProgram[];
  subjects: ActiveSubject[];
  canMap: boolean;
  canCreate: boolean;
  canUpdate: boolean;
}

const hours = (s: SubjectDetails) => {
  const t = totalHours({ lectureHours: s.lectureHours, labHours: s.labHours });
  return t === null ? '—' : `${t} h`;
};

export default function SubjectsScreen({ rows, page, lastPage, total, search, map, subjects, canMap, canCreate, canUpdate }: Props) {
  const router = useRouter();
  // Two views: the Curriculum Map (default) and the Catalogue. Kept in the URL.
  const [view, setView] = useState<'map' | 'catalogue'>(() =>
    typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('view') === 'catalogue' || search) ? 'catalogue' : 'map');
  const [term, setTerm] = useState(search);
  const [form, setForm] = useState<{ editing: SubjectDetails | null } | null>(null);
  const [toggling, setToggling] = useState<SubjectRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canAdd = canCreate && canMap;
  useOpenOnNew(canAdd, () => setForm({ editing: null }));

  const switchView = (v: 'map' | 'catalogue') => {
    setView(v);
    const q = new URLSearchParams(window.location.search);
    q.set('view', v);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${q}`);
  };

  async function toggle() {
    if (!toggling || busy) return;
    setBusy(true); setProblem(null);
    const r = await api.patch(`/api/v1/subjects/${toggling.id}`);
    setBusy(false);
    if (!r.ok) { setProblem(r.message); return; }
    setNotice(`${toggling.code} is now ${toggling.isActive ? 'inactive' : 'active'}.`);
    setToggling(null);
    router.refresh();
  }

  return (
    <PageShell
      eyebrow="Academic / Subjects"
      title="Subjects Management"
      description="Manage curriculum subjects, year levels and semesters. Schedule classes under Classes & Sections."
      actions={canAdd ? (
        <button type="button" onClick={() => setForm({ editing: null })}
          className={`inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 ${FOCUS}`}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New Subject
        </button>
      ) : null}
    >
      <div role="tablist" aria-label="Subjects view" className="inline-flex rounded-xl border border-tdms-hairline bg-white p-1">
        {([['map', 'Curriculum Map'], ['catalogue', `Catalogue (${total})`]] as const).map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => switchView(v)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${view === v ? 'bg-forest text-white' : 'text-ink hover:bg-surface'}`}>
            {label}
          </button>
        ))}
      </div>

      {view === 'map' ? (
        <CurriculumMap programs={map} subjects={subjects} canMap={canMap && canUpdate} onEdit={(s) => setForm({ editing: s })} notice={notice} />
      ) : (
        <div className="space-y-4">
          <form role="search" aria-label="Search the catalogue" className="flex gap-3"
            onSubmit={(e) => { e.preventDefault(); router.push(`/subjects?view=catalogue${term.trim() ? `&search=${encodeURIComponent(term.trim())}` : ''}`); }}>
            <label htmlFor="subjects-search" className="sr-only">Search by code or title</label>
            <input id="subjects-search" type="search" className={INPUT_CLASS} placeholder="Search by subject code or title…" value={term} onChange={(e) => setTerm(e.target.value)} />
            <button type="submit" className={BUTTON_SECONDARY}>Search</button>
          </form>
          {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">{notice}</p>}
          <Card padding="p-0">
            {rows.length === 0 ? (
              <EmptyState title={search ? `No subject matches “${search}”` : 'No subjects yet'} description={search ? 'Try another code or title.' : 'Use New Subject to add one in its curriculum term.'} />
            ) : (
              <>
                <div className="relative overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">
                        <th scope="col" className="px-5 py-3">Subject</th>
                        <th scope="col" className="px-3 py-3">Type</th>
                        <th scope="col" className="px-3 py-3 text-right">Units</th>
                        <th scope="col" className="px-3 py-3">Hours</th>
                        <th scope="col" className="px-3 py-3">Used in</th>
                        <th scope="col" className="px-3 py-3">Status</th>
                        <th scope="col" className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((s) => (
                        <tr key={s.id} className="hover:bg-emerald-50/40">
                          <td className="px-5 py-3"><span className="font-semibold text-navy-900">{s.code}</span><span className="block text-slate-600">{s.title}</span></td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-500">{SUBJECT_TYPE_LABELS[s.subjectType as SubjectType] ?? s.subjectType}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-700">{s.defaultUnits}</td>
                          <td className="px-3 py-3 tabular-nums text-slate-500">{hours(s)}</td>
                          <td className="px-3 py-3 text-xs">
                            {s.usage.length === 0
                              ? <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Not mapped</span>
                              : <ul className="space-y-0.5 text-slate-600">{s.usage.map((u, i) => <li key={i} className="whitespace-nowrap"><span className="font-semibold text-navy-900">{u.program}</span> · {yearLevelLabel(u.yearLevel)} · {SEMESTER_LABELS[u.semester] ?? `Sem ${u.semester}`}</li>)}</ul>}
                          </td>
                          <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ring-1 ring-inset ${s.isActive ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>{s.isActive ? 'Active' : 'Inactive'}</span></td>
                          <td className="whitespace-nowrap px-5 py-3 text-right">
                            {canUpdate && (
                              <div className="flex justify-end gap-3">
                                <button type="button" onClick={() => setForm({ editing: s })} className={`font-medium text-slate-600 hover:text-emerald-700 ${FOCUS}`}>Edit</button>
                                <button type="button" onClick={() => { setProblem(null); setToggling(s); }} className={`font-medium text-slate-600 hover:text-emerald-700 ${FOCUS}`}>{s.isActive ? 'Deactivate' : 'Activate'}</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} lastPage={lastPage} total={total} basePath="/subjects" query={{ view: 'catalogue', search: search || undefined }} />
              </>
            )}
          </Card>
        </div>
      )}

      <SubjectForm
        open={form !== null}
        editing={form?.editing ?? null}
        programs={map}
        scope={readMapScope(map)}
        onClose={() => setForm(null)}
        onSaved={(message) => { setForm(null); setNotice(message); router.refresh(); }}
      />

      <Modal open={toggling !== null} onClose={() => !busy && setToggling(null)} title={toggling?.isActive ? 'Deactivate subject?' : 'Activate subject?'} maxWidth="sm:max-w-md">
        {toggling && (
          <div className="space-y-4">
            <p className="text-sm text-ink">
              {toggling.isActive
                ? <>Deactivate <b>{toggling.code}</b>? It stays in every curriculum and its classes keep their records, but it cannot be scheduled while inactive.</>
                : <>Activate <b>{toggling.code}</b> so it can be scheduled again?</>}
            </p>
            {problem && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{problem}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={BUTTON_SECONDARY} onClick={() => setToggling(null)} disabled={busy}>Cancel</button>
              <button type="button" className={`inline-flex h-10 items-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 ${FOCUS}`} onClick={toggle} disabled={busy} autoFocus>
                {busy ? 'Saving…' : toggling.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
