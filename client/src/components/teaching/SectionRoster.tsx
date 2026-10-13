import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, GraduationCap, Info, Loader2, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { api } from '@/lib/api-client';
import { useRouter } from '@/lib/navigation';
import { yearLevelLabel, type SectionCapacity } from '@shared/lib/teaching';
import { FOCUS } from './kit';
import StudentInfoPanel from './StudentInfoPanel';

/**
 * Section Roster — who is in a section, and adding more.
 *
 * Reads GET /api/v1/sections/:id and changes it through the existing
 * POST/DELETE /api/v1/sections/:id/students, which decide everything: the
 * student must belong to the section's program and still be studying, a
 * student is in one section per school year (unique index), and nobody is
 * moved out of another section — those come back as conflicts, named, with
 * the section they are already in.
 */

interface Person { id: string; studentNumber: string; name: string; status: string; yearLevel: number | null }
interface RosterData {
  section: { id: string; label: string; yearLevel: number; name: string; program: { code: string; name: string }; schoolYear: string; archived: boolean };
  members: Person[];
  candidates: Person[];
  assignedElsewhere: number;
  capacity: SectionCapacity;
}
interface AddResult { added: number; already: number; conflicts: { studentNumber: string; name: string; section: string }[] }

/** "Paculanang, Andy" → "Andy Paculanang", for the avatar's initials. */
const displayName = (n: string) => (n.includes(', ') ? n.split(', ').reverse().join(' ') : n);

const BTN_PRIMARY = `inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
const BTN_QUIET = `inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-ink hover:bg-slate-50 disabled:opacity-50 ${FOCUS}`;

export default function SectionRoster({ sectionId, archived }: { sectionId: string; archived: boolean }) {
  const router = useRouter();
  const searchId = useId();
  const [data, setData] = useState<RosterData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddResult | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  // Stable, so the drawer's key listener is not re-bound on every render.
  const closeInfo = useCallback(() => setViewing(null), []);

  async function load() {
    const r = await api.get<RosterData>(`/api/v1/sections/${sectionId}`);
    if (r.ok) { setData(r.data); setLoadError(null); } else setLoadError(r.message);
  }
  useEffect(() => { setData(null); setPicked(new Set()); setResult(null); setError(null); void load(); }, [sectionId]);

  const candidates = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = q ? data.candidates.filter((c) => `${c.name} ${displayName(c.name)} ${c.studentNumber}`.toLowerCase().includes(q)) : data.candidates;
    // Students of the section's year level first.
    return [...list].sort((a, b) => Number(b.yearLevel === data.section.yearLevel) - Number(a.yearLevel === data.section.yearLevel));
  }, [data, query]);

  if (!data) {
    return loadError
      ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{loadError}</p>
      : <p role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading the roster…</p>;
  }

  const readOnly = archived || data.section.archived;
  const cap = data.capacity;
  const tooMany = picked.size > cap.available;
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const visibleIds = candidates.map((c) => c.id);
  const allVisiblePicked = visibleIds.length > 0 && visibleIds.every((id) => picked.has(id));

  async function add() {
    if (busy || picked.size === 0) return;
    setBusy(true); setError(null); setResult(null); setRemoved(null);
    const r = await api.post<AddResult>(`/api/v1/sections/${sectionId}/students`, { studentIds: [...picked] });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      // Someone else may have just filled it: show the section as it is now.
      if (r.code === 'SECTION_CAPACITY') await load();
      return;
    }
    setResult(r.data);
    setPicked(new Set());
    await load();
    router.refresh();
  }

  async function remove(m: Person) {
    if (busy) return;
    setBusy(true); setError(null); setResult(null); setRemoved(null);
    const r = await api.del(`/api/v1/sections/${sectionId}/students?studentId=${m.id}`);
    setBusy(false);
    setRemoving(null);
    if (!r.ok) { setError(r.message); return; }
    setRemoved(`${displayName(m.name)} was removed from the section. Their attendance and scores are kept.`);
    await load();
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      {/* Stacks on a phone: the name on its own line, the figures in a row below. */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100" aria-hidden="true">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-base font-semibold text-ink">{data.section.label}</p>
            <p className="text-sm text-muted">{data.section.program.name} · School year {data.section.schoolYear}</p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-4 border-t border-slate-200 pt-3 text-sm sm:flex sm:gap-6 sm:border-0 sm:pt-0">
          <div><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Year level</dt><dd className="font-semibold text-ink">{yearLevelLabel(data.section.yearLevel)}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Section</dt><dd className="font-semibold text-ink">{data.section.name}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Students</dt><dd className="font-semibold tabular-nums text-ink">{cap.count}/{cap.capacity}</dd></div>
        </dl>
      </div>

      {/* Capacity */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-ink">
            <span className="font-semibold tabular-nums">{cap.count}/{cap.capacity}</span> students
            <span className="text-muted"> · {cap.available === 0 ? 'no slots available' : `${cap.available} slot${cap.available === 1 ? '' : 's'} available`}</span>
          </p>
          {cap.level === 'full' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">Section Full</span>
          )}
          {cap.level === 'near' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Nearly full</span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Section capacity" aria-valuemin={0} aria-valuemax={cap.capacity} aria-valuenow={cap.count} aria-valuetext={`${cap.count} of ${cap.capacity} students`}>
          <div className={`h-full rounded-full ${cap.level === 'full' ? 'bg-red-500' : cap.level === 'near' ? 'bg-amber-500' : 'bg-primary-600'}`} style={{ width: `${Math.min(100, (cap.count / cap.capacity) * 100)}%` }} />
        </div>
        {cap.over && <p className="text-xs font-medium text-red-700">This section has more students than its limit of {cap.capacity}. No one can be added until it is brought down; nobody is removed automatically.</p>}
      </div>

      {/* Results of the last action */}
      <div aria-live="polite" className="space-y-2">
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">{error}</p>}
        {removed && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">{removed}</p>}
        {result && (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
            <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {result.added === 0 ? 'No students were added.' : `Added ${result.added} student${result.added === 1 ? '' : 's'}. Their instructors were notified.`}
            </p>
            {result.already > 0 && <p className="mt-1">{result.already} {result.already === 1 ? 'was' : 'were'} already in this section.</p>}
            {result.conflicts.length > 0 && (
              <div className="mt-2 rounded-lg bg-white/70 p-3 text-amber-900 ring-1 ring-inset ring-amber-200">
                <p className="font-semibold">Not added — already in another section this school year:</p>
                <ul className="mt-1 list-disc pl-5">{result.conflicts.map((c) => <li key={c.studentNumber}>{c.name} ({c.studentNumber}) — {c.section}</li>)}</ul>
                <p className="mt-1 text-xs">A student is in one section per school year. Remove them from that section first to move them here.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Students in this section */}
        <section aria-labelledby={`${searchId}-members`} className="flex min-w-0 flex-col rounded-xl border border-slate-200">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 id={`${searchId}-members`} className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Users className="h-4 w-4 text-primary-700" aria-hidden="true" /> Students in this section
            </h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink">{data.members.length}</span>
          </header>
          {data.members.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-semibold text-ink">No students yet</p>
              <p className="mt-1 text-sm text-muted">{readOnly ? 'This school year is archived.' : 'Add students from the list on the right.'}</p>
            </div>
          ) : (
            <ul className="max-h-[22rem] divide-y divide-slate-100 overflow-y-auto">
              {data.members.map((m) => (
                // The whole row opens Student Information; the button inside is
                // what keyboards and screen readers reach (Enter/Space), and where focus
                // returns when the panel closes.
                <li key={m.id} className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-emerald-50/70" onClick={(e) => { e.currentTarget.querySelector('button')?.focus(); setViewing(m.id); }}>
                  <button
                    type="button"
                    className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left ${FOCUS}`}
                    aria-label={`View ${displayName(m.name)}’s information`}
                    title="View student information"
                    onClick={(e) => { e.stopPropagation(); setViewing(m.id); }}
                  >
                    <Avatar name={displayName(m.name)} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink group-hover:text-emerald-800">{displayName(m.name)}</span>
                      <span className="block text-xs tabular-nums text-muted">{m.studentNumber}{m.yearLevel ? ` · Year ${m.yearLevel}` : ''}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-emerald-700" aria-hidden="true" />
                  </button>
                  {/* Removal stays its own action: clicks here never open the panel. */}
                  {!readOnly && <span onClick={(e) => e.stopPropagation()}>{removing === m.id ? (
                    <span className="flex items-center gap-1.5">
                      <button type="button" className={`${BTN_QUIET} border-red-200 text-red-700 hover:bg-red-50`} disabled={busy} onClick={() => remove(m)} autoFocus>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Remove
                      </button>
                      <button type="button" className={BTN_QUIET} disabled={busy} onClick={() => setRemoving(null)}>Keep</button>
                    </span>
                  ) : (
                    <button type="button" className={BTN_QUIET} aria-label={`Remove ${displayName(m.name)} from this section`} disabled={busy} onClick={() => setRemoving(m.id)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Add students */}
        {!readOnly && (
          <section aria-labelledby={`${searchId}-add`} className="flex min-w-0 flex-col rounded-xl border border-slate-200">
            <header className="border-b border-slate-200 px-4 py-3">
              <h3 id={`${searchId}-add`} className="flex items-center gap-2 text-sm font-semibold text-ink">
                <UserPlus className="h-4 w-4 text-primary-700" aria-hidden="true" /> Add students
              </h3>
              <p className="mt-0.5 text-xs text-muted">Students of {data.section.program.code} not yet in a section for {data.section.schoolYear}.</p>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <label htmlFor={searchId} className="sr-only">Search by name or student ID</label>
                <input
                  id={searchId}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or student ID"
                  className="block h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-ink placeholder:text-slate-400 hover:border-slate-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20"
                />
              </div>
            </header>

            {cap.available === 0 ? (
              <div className="flex gap-2 px-4 py-6 text-sm text-red-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>This section has reached its maximum capacity of {cap.capacity} students. Create another section to accommodate additional students.</p>
              </div>
            ) : data.candidates.length === 0 ? (
              <div className="flex gap-2 px-4 py-6 text-sm text-muted">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  No eligible students.
                  {data.assignedElsewhere > 0
                    ? ` ${data.assignedElsewhere} active ${data.section.program.code} student${data.assignedElsewhere === 1 ? ' is' : 's are'} already in another section this school year.`
                    : ` Only active students of ${data.section.program.code} who are not in a section for ${data.section.schoolYear} appear here.`}
                </p>
              </div>
            ) : candidates.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">No student matches “{query}”.</p>
            ) : (
              <>
                <label className="flex cursor-pointer items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-xs font-semibold text-muted">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                    checked={allVisiblePicked}
                    onChange={() => setPicked((p) => { const n = new Set(p); if (allVisiblePicked) visibleIds.forEach((id) => n.delete(id)); else visibleIds.forEach((id) => n.add(id)); return n; })} />
                  Select all {query ? 'matching' : ''} ({visibleIds.length})
                </label>
                <ul className="max-h-[18rem] divide-y divide-slate-100 overflow-y-auto">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <label className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-slate-50 ${picked.has(c.id) ? 'bg-primary-50/60' : ''}`}>
                        <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                        <Avatar name={displayName(c.name)} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{displayName(c.name)}</span>
                          <span className="block text-xs tabular-nums text-muted">{c.studentNumber}</span>
                        </span>
                        {c.yearLevel !== null && (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.yearLevel === data.section.yearLevel ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}
                            title={c.yearLevel === data.section.yearLevel ? undefined : 'A different year level from this section'}>
                            Year {c.yearLevel}
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <footer className="mt-auto flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
              <p className={`text-sm ${tooMany ? 'font-medium text-red-700' : 'text-muted'}`} aria-live="polite">
                <span className="font-semibold tabular-nums">{picked.size}</span> selected · {cap.available} slot{cap.available === 1 ? '' : 's'} left
                {tooMany && <span className="block text-xs">Select at most {cap.available}.</span>}
              </p>
              <button type="button" className={BTN_PRIMARY} disabled={busy || picked.size === 0 || tooMany || cap.available === 0} aria-busy={busy} onClick={add}>
                {busy && picked.size > 0 ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
                {busy && picked.size > 0 ? 'Adding…' : 'Add Selected Students'}
              </button>
            </footer>
          </section>
        )}
      </div>

      <StudentInfoPanel sectionId={sectionId} studentId={viewing} onClose={closeInfo} />
    </div>
  );
}
