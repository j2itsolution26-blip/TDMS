import { useState } from 'react';
import Link from '@/lib/link';
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Modal from '@/components/Modal';
import { Page } from '@/lib/page-data';
import { api } from '@/lib/api-client';
import { useRouter } from '@/lib/navigation';
import { ACTIVITY_STATUSES, ACTIVITY_STATUS_LABELS, ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, type ActivityStatus } from '@shared/lib/assessment-center';
import { BTN, BTN_DANGER, BTN_SECONDARY, BTN_SMALL, Card, Field, Flash, FOCUS, INPUT, PageShell, StatusPill } from '@/components/teaching/kit';
import { withQuery } from '@/components/assessment/parts';
import type { loadAssessmentCalendar } from '@/server/controllers/pages/app/assessment';

type Data = Awaited<ReturnType<typeof loadAssessmentCalendar>>;
type Activity = Data['activities'][number];
type View = Data['view'];

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TYPE_STYLE: Record<string, string> = {
  TRAINING: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  ASSESSMENT: 'bg-blue-50 text-blue-900 ring-blue-200',
};
const STATUS_TONE = { SCHEDULED: 'info', IN_PROGRESS: 'attention', COMPLETED: 'success', CANCELLED: 'neutral' } as const;

/** The viewer's own calendar day for an instant. */
const localKey = (iso: string | Date) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dateTime = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
/** For <input type="datetime-local">, in the viewer's zone. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${localKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function days(from: string, to: string) {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}
function shift(view: View, date: string, by: number) {
  if (view === 'week') return addDays(date, 7 * by);
  if (view === 'agenda') return addDays(date, 30 * by);
  const [y, m] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 10);
}
const onDay = (a: Activity, key: string) => localKey(a.startsAt) <= key && localKey(new Date(new Date(a.endsAt).getTime() - 1)) >= key;

function Pill({ a, onOpen }: { a: Activity; onOpen: (a: Activity) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(a)}
      title={`${a.title} · ${time(a.startsAt)}–${time(a.endsAt)}${a.venue ? ` · ${a.venue}` : ''}`}
      className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold ring-1 ring-inset hover:brightness-95 ${TYPE_STYLE[a.activityType]} ${a.status === 'CANCELLED' ? 'line-through opacity-60' : ''} ${FOCUS}`}
    >
      {time(a.startsAt)} {a.title}
    </button>
  );
}

function Grid({ d, onOpen }: { d: Data; onOpen: (a: Activity) => void }) {
  const cells = days(d.from, d.to);
  const month = d.date.slice(0, 7);
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-tdms-hairline bg-tdms-hairline" role="grid">
      {DAY_SHORT.map((n) => <div key={n} role="columnheader" className="bg-tdms-bg px-2 py-1.5 text-center text-xs font-bold uppercase tracking-[0.06em] text-tdms-muted">{n}</div>)}
      {cells.map((key) => {
        const list = d.activities.filter((a) => onDay(a, key));
        const max = d.view === 'week' ? 20 : 3;
        const faded = d.view === 'month' && key.slice(0, 7) !== month;
        return (
          <div key={key} role="gridcell" className={`${d.view === 'week' ? 'min-h-[220px]' : 'min-h-[96px]'} bg-white p-1.5 ${faded ? 'bg-tdms-bg/50' : ''} ${key === d.today ? 'ring-2 ring-inset ring-tdms-text' : ''}`}>
            <p className={`text-xs font-semibold tabular-nums ${key === d.today ? 'text-tdms-text' : faded ? 'text-tdms-muted/60' : 'text-tdms-muted'}`}>{Number(key.slice(8))}</p>
            <ul className="mt-1 space-y-1">
              {list.slice(0, max).map((a) => <li key={a.id}><Pill a={a} onOpen={onOpen} /></li>)}
              {list.length > max && <li className="text-[11px] text-tdms-muted">+{list.length - max} more</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Agenda({ d, onOpen }: { d: Data; onOpen: (a: Activity) => void }) {
  const list = d.activities.filter((a) => localKey(a.endsAt) >= d.from && localKey(a.startsAt) <= d.to);
  if (list.length === 0) return <p className="py-6 text-center text-sm text-tdms-muted">Nothing scheduled in these 30 days.</p>;
  return (
    <ul className="divide-y divide-tdms-hairline">
      {list.map((a) => (
        <li key={a.id}>
          <button type="button" onClick={() => onOpen(a)} className={`flex w-full flex-wrap items-start justify-between gap-3 py-3 text-left hover:bg-tdms-bg/40 ${FOCUS}`}>
            <div className="min-w-0">
              <p className={`font-semibold text-tdms-ink ${a.status === 'CANCELLED' ? 'line-through' : ''}`}>{a.title}</p>
              <p className="text-[13px] tabular-nums text-tdms-muted">{dateTime(a.startsAt)} – {dateTime(a.endsAt)}</p>
              <p className="text-[13px] text-tdms-muted">
                {[a.venue, a.program?.code, a.batch && `Batch ${a.batch.batchNumber}`, a.assignedName && `Assessor/instructor: ${a.assignedName}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TYPE_STYLE[a.activityType]}`}>{ACTIVITY_TYPE_LABELS[a.activityType]}</span>
              <StatusPill label={ACTIVITY_STATUS_LABELS[a.status as ActivityStatus]} tone={STATUS_TONE[a.status as ActivityStatus]} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Details({ a }: { a: Activity }) {
  const rows: [string, string | null | undefined][] = [
    ['Type', ACTIVITY_TYPE_LABELS[a.activityType]],
    ['Status', ACTIVITY_STATUS_LABELS[a.status as ActivityStatus]],
    ['When', `${dateTime(a.startsAt)} – ${dateTime(a.endsAt)}`],
    ['Venue', a.venue],
    ['Qualification', a.program && `${a.program.code} — ${a.program.name}`],
    ['Batch', a.batch?.batchNumber],
    ['Assessor / instructor', a.assignedName],
    ['Responsible', a.responsibleName],
    ['Description', a.description],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-[10rem_1fr]">
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[13px] font-semibold text-tdms-muted">{k}</dt>
          <dd className="text-sm text-tdms-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ActivityForm({ a, options, defaultDay, onDone }: { a: Activity | null; options: NonNullable<Data['options']>; defaultDay: string; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [conflicts, setConflicts] = useState<string[] | null>(null);
  const [f, setF] = useState({
    title: a?.title ?? '',
    description: a?.description ?? '',
    activityType: a?.activityType ?? 'TRAINING',
    programId: a?.program?.id ?? '',
    batchId: a?.batch?.id ?? '',
    startsAt: a ? toLocalInput(a.startsAt) : `${defaultDay}T08:00`,
    endsAt: a ? toLocalInput(a.endsAt) : `${defaultDay}T17:00`,
    venue: a?.venue ?? '',
    assignedUserId: a?.assignedUserId ?? '',
    assignedName: a && !a.assignedUserId ? (a.assignedName ?? '') : '',
    responsibleUserId: a?.responsibleUserId ?? '',
    responsibleName: a && !a.responsibleUserId ? (a.responsibleName ?? '') : '',
    status: a?.status ?? 'SCHEDULED',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setConflicts(null); };
  const batches = f.programId ? options.batches.filter((b) => b.programId === f.programId) : options.batches;

  async function save(acknowledgeConflicts: boolean) {
    setBusy(true);
    setError(null);
    setErrors({});
    const start = new Date(f.startsAt);
    const end = new Date(f.endsAt);
    const body = {
      ...f,
      description: f.description || null,
      programId: f.programId || null,
      batchId: f.batchId || null,
      venue: f.venue || null,
      startsAt: Number.isNaN(start.getTime()) ? f.startsAt : start.toISOString(),
      endsAt: Number.isNaN(end.getTime()) ? f.endsAt : end.toISOString(),
      assignedUserId: f.assignedUserId || null,
      assignedName: f.assignedUserId ? null : f.assignedName || null,
      responsibleUserId: f.responsibleUserId || null,
      responsibleName: f.responsibleUserId ? null : f.responsibleName || null,
      acknowledgeConflicts,
    };
    const result = a ? await api.put(`/api/v1/assessment/activities/${a.id}`, body) : await api.post('/api/v1/assessment/activities', body);
    setBusy(false);
    if (result.ok) { onDone(); router.refresh(); return; }
    if (result.code === 'SCHEDULE_CONFLICT') { setConflicts(result.errors?.conflicts ?? []); setError(result.message); return; }
    setErrors(result.errors ?? {});
    setError(result.message);
  }
  async function remove() {
    if (!a || !window.confirm(`Delete "${a.title}" from the calendar? Everyone it concerns is notified.`)) return;
    setBusy(true);
    const result = await api.del(`/api/v1/assessment/activities/${a.id}`);
    setBusy(false);
    if (result.ok) { onDone(); router.refresh(); } else setError(result.message);
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(false); }} noValidate>
      <Field label="Title" htmlFor="a-title" error={errors.title}><input id="a-title" className={INPUT} value={f.title} onChange={set('title')} required maxLength={255} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="a-type" error={errors.activityType}>
          <select id="a-type" className={INPUT} value={f.activityType} onChange={set('activityType')}>
            {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{ACTIVITY_TYPE_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field label="Status" htmlFor="a-status" error={errors.status}>
          <select id="a-status" className={INPUT} value={f.status} onChange={set('status')}>
            {ACTIVITY_STATUSES.map((s) => <option key={s} value={s}>{ACTIVITY_STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="Starts" htmlFor="a-start" error={errors.startsAt}><input id="a-start" type="datetime-local" className={INPUT} value={f.startsAt} onChange={set('startsAt')} required /></Field>
        <Field label="Ends" htmlFor="a-end" error={errors.endsAt}><input id="a-end" type="datetime-local" className={INPUT} value={f.endsAt} onChange={set('endsAt')} required /></Field>
        <Field label="Qualification" htmlFor="a-program" error={errors.programId}>
          <select id="a-program" className={INPUT} value={f.programId} onChange={(e) => { setF({ ...f, programId: e.target.value, batchId: '' }); setConflicts(null); }}>
            <option value="">None</option>
            {options.qualifications.map((q) => <option key={q.id} value={q.id}>{q.code} — {q.name}</option>)}
          </select>
        </Field>
        <Field label="Batch" htmlFor="a-batch" error={errors.batchId}>
          <select id="a-batch" className={INPUT} value={f.batchId} onChange={set('batchId')}>
            <option value="">None</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.batchNumber} · {b.assessmentDate}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Venue" htmlFor="a-venue" error={errors.venue}><input id="a-venue" className={INPUT} value={f.venue} onChange={set('venue')} maxLength={255} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Assessor / instructor" htmlFor="a-assigned" error={errors.assignedUserId}>
          <select id="a-assigned" className={INPUT} value={f.assignedUserId} onChange={set('assignedUserId')}>
            <option value="">Not an account (type a name) / none</option>
            {options.assessors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {!f.assignedUserId && <input aria-label="Assessor or instructor name" className={`${INPUT} mt-2`} placeholder="Name (optional)" value={f.assignedName} onChange={set('assignedName')} maxLength={255} />}
        </Field>
        <Field label="Responsible person" htmlFor="a-responsible" error={errors.responsibleUserId}>
          <select id="a-responsible" className={INPUT} value={f.responsibleUserId} onChange={set('responsibleUserId')}>
            <option value="">Not an account (type a name) / none</option>
            {options.staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {!f.responsibleUserId && <input aria-label="Responsible person name" className={`${INPUT} mt-2`} placeholder="Name (optional)" value={f.responsibleName} onChange={set('responsibleName')} maxLength={255} />}
        </Field>
      </div>
      <Field label="Description" htmlFor="a-desc" error={errors.description}><textarea id="a-desc" rows={2} className={INPUT} value={f.description} onChange={set('description')} maxLength={2000} /></Field>

      {conflicts ? (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> {error}</p>
          <ul className="mt-1 list-disc pl-5">{conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="mt-2">Change the time, venue or people — or save anyway if the overlap is intended.</p>
        </div>
      ) : (
        error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        <div>{a && <button type="button" className={BTN_DANGER} disabled={busy} onClick={remove}>Delete</button>}</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button>
          {conflicts && <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => save(true)}>Save anyway</button>}
          <button type="submit" className={BTN} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <p className="text-xs text-tdms-muted">Saving notifies the Assessment Center, the TVET office and the people named here.</p>
    </form>
  );
}

function ViewScreen(d: Data) {
  const [open, setOpen] = useState<Activity | 'new' | null>(null);
  const href = (view: View, date: string) => withQuery('/assessment/calendar', { view, date });
  const title =
    d.view === 'month'
      ? new Date(`${d.date.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      : d.view === 'week'
        ? `Week of ${new Date(`${d.from}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`
        : `30 days from ${new Date(`${d.from}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
  const editing = open !== null && open !== 'new' && d.canManage;

  return (
    <PageShell
      eyebrow="Assessment Center"
      title="Training & Assessment Calendar"
      description="Training sessions and assessment schedules. Overlapping venues, assessors or batches are flagged before saving."
      actions={d.canManage && <button type="button" className={BTN} onClick={() => setOpen('new')}><Plus className="h-4 w-4" aria-hidden="true" /> Schedule activity</button>}
    >
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="flex items-center gap-2">
            <Link href={href(d.view, shift(d.view, d.date, -1))} className={BTN_SMALL} aria-label="Previous"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Link>
            <h2 className="min-w-[12rem] text-center text-lg font-bold text-tdms-ink">{title}</h2>
            <Link href={href(d.view, shift(d.view, d.date, 1))} className={BTN_SMALL} aria-label="Next"><ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
            <Link href={href(d.view, d.today)} className={`${BTN_SMALL} ml-1`}>Today</Link>
          </div>
          <div className="inline-flex rounded-xl border border-tdms-hairline bg-white p-0.5" role="group" aria-label="Calendar view">
            {(['month', 'week', 'agenda'] as const).map((v) => (
              <Link key={v} href={href(v, d.date)} aria-current={d.view === v ? 'page' : undefined} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${d.view === v ? 'bg-tdms-text text-white' : 'text-tdms-ink hover:bg-tdms-bg'} ${FOCUS}`}>{v}</Link>
            ))}
          </div>
        </div>
        <div className="mt-4 pb-5">
          {d.view === 'agenda' ? <Agenda d={d} onOpen={setOpen} /> : (
            <>
              <div className="hidden md:block"><Grid d={d} onOpen={setOpen} /></div>
              <div className="md:hidden"><Agenda d={d} onOpen={setOpen} /></div>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-3 pb-5 text-xs text-tdms-muted">
          {ACTIVITY_TYPES.map((t) => <span key={t} className={`rounded-full px-2.5 py-0.5 font-semibold ring-1 ring-inset ${TYPE_STYLE[t]}`}>{ACTIVITY_TYPE_LABELS[t]}</span>)}
          {!d.canManage && <span>View only — the calendar is managed by the Assessment Center.</span>}
        </div>
      </Card>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === 'new' ? 'Schedule activity' : editing ? 'Edit activity' : open ? open.title : ''}
        maxWidth="sm:max-w-3xl"
      >
        {open !== null && d.options && (open === 'new' || editing) ? (
          <ActivityForm a={open === 'new' ? null : open} options={d.options} defaultDay={d.view === 'agenda' || d.date.slice(0, 7) === d.today.slice(0, 7) ? d.today : d.date} onDone={() => setOpen(null)} />
        ) : (
          open !== null && open !== 'new' && <Details a={open} />
        )}
      </Modal>
    </PageShell>
  );
}

/** /assessment/calendar */
export default function AssessmentCalendarPage() {
  return <Page<Data> endpoint="/assessment/calendar" render={(d) => <ViewScreen {...d} />} />;
}
