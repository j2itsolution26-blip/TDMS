import { useState } from 'react';
import Link from '@/lib/link';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { CALENDAR_TYPES, CALENDAR_TYPE_LABELS, DAY_SHORT } from '@shared/lib/teaching';
import type { CalendarEntry } from '@/server/services/teaching/calendar';
import { useAction } from './client-kit';
import { BTN, BTN_DANGER, BTN_SECONDARY, BTN_SMALL, Card, Field, Flash, FOCUS, INPUT } from './kit';

const TYPE_STYLE: Record<string, string> = {
  HOLIDAY: 'bg-red-50 text-red-800 ring-red-200',
  ACADEMIC: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  EXAM_PERIOD: 'bg-amber-50 text-amber-900 ring-amber-200',
  ENROLLMENT: 'bg-blue-50 text-blue-800 ring-blue-200',
  EVENT: 'bg-violet-50 text-violet-800 ring-violet-200',
  SEMESTER: 'bg-teal-50 text-teal-800 ring-teal-200',
  SCHOOL_YEAR: 'bg-slate-100 text-slate-800 ring-slate-200',
};

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The school calendar. Everyone sees it; the Admin, Director and Coordinator
 * manage it. For everyone else it is view-only — the server refuses changes
 * whatever the page shows.
 */
export default function CalendarScreen({ month, entries, canManage, today }: { month: string; entries: CalendarEntry[]; canManage: boolean; today: string }) {
  const [editing, setEditing] = useState<CalendarEntry | 'new' | null>(null);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => {
    const day = i - lead + 1;
    return day >= 1 && day <= days ? `${month}-${String(day).padStart(2, '0')}` : null;
  });
  const on = (key: string) => entries.filter((e) => e.startsOn <= key && e.endsOn >= key);
  const title = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="flex items-center gap-2">
            <Link href={`/calendar?month=${shiftMonth(month, -1)}`} className={BTN_SMALL} aria-label="Previous month"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Link>
            <h2 className="min-w-[10rem] text-center text-lg font-bold text-tdms-ink">{title}</h2>
            <Link href={`/calendar?month=${shiftMonth(month, 1)}`} className={BTN_SMALL} aria-label="Next month"><ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
            <Link href="/calendar" className={`${BTN_SMALL} ml-1`}>Today</Link>
          </div>
          {canManage ? (
            <button type="button" className={BTN} onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" /> Add event</button>
          ) : (
            <p className="text-xs text-tdms-muted">View only — the calendar is managed by the TVET office.</p>
          )}
        </div>
        <div className="mt-4 hidden grid-cols-7 gap-px overflow-hidden rounded-xl border border-tdms-hairline bg-tdms-hairline md:grid" role="grid" aria-label={title}>
          {DAY_SHORT.map((d) => <div key={d} role="columnheader" className="bg-tdms-bg px-2 py-1.5 text-center text-xs font-bold uppercase tracking-[0.06em] text-tdms-muted">{d}</div>)}
          {cells.map((key, i) => (
            <div key={i} role="gridcell" className={`min-h-[96px] bg-white p-1.5 ${key === today ? 'ring-2 ring-inset ring-tdms-text' : ''}`}>
              {key && (
                <>
                  <p className={`text-xs font-semibold tabular-nums ${key === today ? 'text-tdms-text' : 'text-tdms-muted'}`}>{Number(key.slice(8))}</p>
                  <ul className="mt-1 space-y-1">
                    {on(key).slice(0, 3).map((e) => (
                      <li key={e.id}>
                        <button type="button" disabled={!e.editable} onClick={() => setEditing(e)} className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold ring-1 ring-inset ${TYPE_STYLE[e.type] ?? TYPE_STYLE.EVENT} ${e.editable ? 'hover:brightness-95' : 'cursor-default'} ${FOCUS}`} title={e.title}>
                          {e.title}
                        </button>
                      </li>
                    ))}
                    {on(key).length > 3 && <li className="text-[11px] text-tdms-muted">+{on(key).length - 3} more</li>}
                  </ul>
                </>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Events this month" description={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}>
        {entries.length === 0 ? (
          <p className="text-sm text-tdms-muted">Nothing on the calendar this month.</p>
        ) : (
          <ul className="divide-y divide-tdms-hairline">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-tdms-ink">{e.title}</p>
                  <p className="text-[13px] text-tdms-muted tabular-nums">{e.startsOn === e.endsOn ? e.startsOn : `${e.startsOn} to ${e.endsOn}`}</p>
                  {e.description && <p className="mt-1 text-[13px]">{e.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TYPE_STYLE[e.type] ?? TYPE_STYLE.EVENT}`}>{e.typeLabel}</span>
                  {e.editable && <button type="button" className={BTN_SMALL} onClick={() => setEditing(e)}>Edit</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add calendar event' : 'Edit calendar event'}>
        {editing !== null && <EventForm event={editing === 'new' ? null : editing} defaultDate={month === today.slice(0, 7) ? today : `${month}-01`} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function EventForm({ event, defaultDate, onDone }: { event: CalendarEntry | null; defaultDate: string; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [f, setF] = useState({
    title: event?.title ?? '',
    description: event?.description ?? '',
    type: (event?.type !== 'SCHOOL_YEAR' ? event?.type : undefined) ?? 'EVENT',
    startsOn: event?.startsOn ?? defaultDate,
    endsOn: event?.endsOn ?? defaultDate,
    notify: false,
  });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...f, description: f.description || null };
    if (await run(() => (event ? api.put(`/api/v1/calendar/${event.id}`, body) : api.post('/api/v1/calendar', body)))) onDone();
  }
  return (
    <form className="space-y-4" onSubmit={save}>
      <Field label="Title" htmlFor="ev-title" error={errors.title}><input id="ev-title" className={INPUT} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={255} /></Field>
      <Field label="Type" htmlFor="ev-type" error={errors.type}>
        <select id="ev-type" className={INPUT} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}>
          {CALENDAR_TYPES.map((t) => <option key={t} value={t}>{CALENDAR_TYPE_LABELS[t]}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Starts" htmlFor="ev-start" error={errors.startsOn}><input id="ev-start" type="date" className={INPUT} value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value, endsOn: f.endsOn < e.target.value ? e.target.value : f.endsOn })} required /></Field>
        <Field label="Ends" htmlFor="ev-end" error={errors.endsOn}><input id="ev-end" type="date" className={INPUT} value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} required /></Field>
      </div>
      <Field label="Description" htmlFor="ev-desc" error={errors.description}><textarea id="ev-desc" rows={2} className={INPUT} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      {!event && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="rounded border-tdms-hairline text-tdms-text focus:ring-tdms-text" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} />
          Announce it — notify all staff and students
        </label>
      )}
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-between gap-2">
        <div>{event && <button type="button" className={BTN_DANGER} disabled={busy} onClick={async () => { if (window.confirm('Delete this event?') && (await run(() => api.del(`/api/v1/calendar/${event.id}`)))) onDone(); }}>Delete</button>}</div>
        <div className="flex gap-2"><button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button><button type="submit" className={BTN} disabled={busy}>Save</button></div>
      </div>
    </form>
  );
}
