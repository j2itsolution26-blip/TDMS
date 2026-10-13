import { useState } from 'react';
import { Archive, Plus } from 'lucide-react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api-client';
import { SEMESTER_LABELS, nextSchoolYearLabel } from '@shared/lib/teaching';
import { useAction } from './client-kit';
import { BTN, BTN_DANGER, BTN_SECONDARY, BTN_SMALL, Card, Chip, Field, Flash, INPUT, TD, TH, Table } from './kit';

interface Year {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  status: string;
  currentSemester: number;
  archivedAt: string | null;
}

interface Check {
  key: string;
  label: string;
  description: string;
  count: number;
  blocking: boolean;
}

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Active', UPCOMING: 'Upcoming', ARCHIVED: 'Archived' };

/**
 * The school-year lifecycle. Archiving runs the pre-archive checks first and
 * shows them; an open attendance session blocks, anything else outstanding
 * must be acknowledged. The next year is opened in the same step.
 */
export default function SchoolYearsScreen({ years, canManage }: { years: Year[]; canManage: boolean }) {
  const act = useAction();
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<Year | null>(null);

  return (
    <>
      <Card
        padded={false}
        title={`${years.length} school ${years.length === 1 ? 'year' : 'years'}`}
        description="Archived years stay viewable and read-only. Students are permanent records; each year keeps its own sections, classes and results."
        actions={canManage ? <button type="button" className={BTN_SECONDARY} onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" /> New school year</button> : null}
      >
        <div className="space-y-2 px-5 pb-3 sm:px-6">
          {act.notice && <Flash kind="success">{act.notice}</Flash>}
          {act.error && <Flash kind="error">{act.error}</Flash>}
        </div>
        <Table
          label="School years"
          head={
            <>
              <th scope="col" className={TH}>School year</th>
              <th scope="col" className={TH}>Dates</th>
              <th scope="col" className={TH}>Semester</th>
              <th scope="col" className={TH}>Status</th>
              <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
            </>
          }
        >
          {years.map((y) => (
            <tr key={y.id}>
              <td className={`${TD} text-base font-bold`}>{y.label.replace('-', '–')}</td>
              <td className={`${TD} whitespace-nowrap tabular-nums text-[13px]`}>{y.startsOn} to {y.endsOn}</td>
              <td className={TD}>
                {canManage && y.status !== 'ARCHIVED' ? (
                  <label>
                    <span className="sr-only">Current semester of {y.label}</span>
                    <select
                      className={`${INPUT} w-auto py-1.5`}
                      value={y.currentSemester}
                      disabled={act.busy}
                      onChange={(e) => act.run(() => api.post(`/api/v1/school-years/${y.id}/semester`, { semester: Number(e.target.value) }), { success: 'Current semester updated.' })}
                    >
                      {[1, 2, 3].map((s) => <option key={s} value={s}>{SEMESTER_LABELS[s]}</option>)}
                    </select>
                  </label>
                ) : (
                  SEMESTER_LABELS[y.currentSemester]
                )}
              </td>
              <td className={TD}>
                <Chip status={y.status} label={STATUS_LABEL[y.status] ?? y.status} />
                {y.archivedAt && <span className="block text-xs text-tdms-muted">on {y.archivedAt.slice(0, 10)}</span>}
              </td>
              <td className={`${TD} whitespace-nowrap text-right`}>
                {canManage && y.status === 'ACTIVE' && (
                  <button type="button" className={BTN_SMALL} onClick={() => setArchiving(y)}>
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archive School Year
                  </button>
                )}
                {canManage && y.status === 'UPCOMING' && !years.some((x) => x.status === 'ACTIVE') && (
                  <button type="button" className={BTN_SMALL} disabled={act.busy} onClick={() => act.run(() => api.post(`/api/v1/school-years/${y.id}/activate`), { success: `${y.label} is now the active school year.` })}>
                    Activate
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="New school year">
        <CreateYearForm latest={years[0]?.label ?? null} onDone={() => setCreating(false)} />
      </Modal>
      <Modal open={archiving !== null} onClose={() => setArchiving(null)} title={archiving ? `Archive ${archiving.label.replace('-', '–')}` : ''} maxWidth="sm:max-w-2xl">
        {archiving && <ArchiveFlow year={archiving} onDone={() => setArchiving(null)} />}
      </Modal>
    </>
  );
}

function CreateYearForm({ latest, onDone }: { latest: string | null; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const suggested = latest ? nextSchoolYearLabel(latest) : null;
  const [label, setLabel] = useState(suggested ?? '');
  const first = Number(label.slice(0, 4)) || new Date().getFullYear();
  const [startsOn, setStart] = useState(`${first}-06-01`);
  const [endsOn, setEnd] = useState(`${first + 1}-05-31`);
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/api/v1/school-years', { label, startsOn, endsOn }), { success: 'Created.' })) onDone(); }}>
      <p className="text-sm text-tdms-muted">A new year starts as Upcoming. It becomes active when the current year is archived.</p>
      <Field label="School year" htmlFor="sy-label" error={errors.label} hint="e.g. 2027-2028">
        <input id="sy-label" className={INPUT} value={label} onChange={(e) => setLabel(e.target.value)} pattern="\d{4}-\d{4}" required />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Starts" htmlFor="sy-start" error={errors.startsOn}><input id="sy-start" type="date" className={INPUT} value={startsOn} onChange={(e) => setStart(e.target.value)} required /></Field>
        <Field label="Ends" htmlFor="sy-end" error={errors.endsOn}><input id="sy-end" type="date" className={INPUT} value={endsOn} onChange={(e) => setEnd(e.target.value)} required /></Field>
      </div>
      {error && !Object.keys(errors).length && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button>
        <button type="submit" className={BTN} disabled={busy}>Create</button>
      </div>
    </form>
  );
}

function ArchiveFlow({ year, onDone }: { year: Year; onDone: () => void }) {
  const { busy, error, errors, run } = useAction();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [ack, setAck] = useState(false);
  const next = nextSchoolYearLabel(year.label);
  const nextFirst = Number(next?.slice(0, 4)) || new Date().getFullYear() + 1;
  const [createNext, setCreateNext] = useState(true);
  const [nextStartsOn, setNextStart] = useState(`${nextFirst}-06-01`);
  const [nextEndsOn, setNextEnd] = useState(`${nextFirst + 1}-05-31`);

  if (checks === null) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Archiving makes every class, attendance record, score, grade and document of <strong>{year.label.replace('-', '–')}</strong> read-only. Nothing is deleted, and the year stays viewable.
        </p>
        {error && <Flash kind="error">{error}</Flash>}
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button>
          <button
            type="button"
            className={BTN}
            disabled={busy}
            onClick={async () => {
              const r = await run(() => api.get<{ checks: Check[] }>(`/api/v1/school-years/${year.id}/archive`), { refresh: false });
              if (r) setChecks(r.checks);
            }}
          >
            {busy ? 'Checking…' : 'Run pre-archive checks'}
          </button>
        </div>
      </div>
    );
  }

  const blocking = checks.filter((c) => c.blocking && c.count > 0);
  const outstanding = checks.filter((c) => !c.blocking && c.count > 0);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() => api.post(`/api/v1/school-years/${year.id}/archive`, { acknowledge: ack, createNext, nextStartsOn, nextEndsOn }), {
          success: `${year.label} archived.`,
        });
        if (ok) onDone();
      }}
    >
      <ul className="divide-y divide-tdms-hairline rounded-xl border border-tdms-hairline">
        {checks.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{c.label}</span>
              <span className="block text-xs text-tdms-muted">{c.description}</span>
            </span>
            {c.count === 0 ? <Chip status="APPROVED" label="Clear" /> : <Chip status={c.blocking ? 'REJECTED' : 'PENDING'} label={`${c.count}${c.blocking ? ' — must clear' : ''}`} />}
          </li>
        ))}
      </ul>
      {blocking.length > 0 ? (
        <Flash kind="error">Close every open attendance session before archiving.</Flash>
      ) : (
        <>
          {outstanding.length > 0 && (
            <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <input type="checkbox" className="mt-0.5 rounded border-amber-300 text-tdms-text focus:ring-tdms-text" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              I have reviewed the outstanding items above and want to archive anyway. They will remain as they are, read-only.
            </label>
          )}
          <fieldset className="rounded-xl border border-tdms-hairline p-4">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="rounded border-tdms-hairline text-tdms-text focus:ring-tdms-text" checked={createNext} onChange={(e) => setCreateNext(e.target.checked)} />
              Open {next?.replace('-', '–') ?? 'the next year'} as the new active school year
            </label>
            {createNext && (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <Field label="Starts" htmlFor="ny-start" error={errors.nextStartsOn}><input id="ny-start" type="date" className={INPUT} value={nextStartsOn} onChange={(e) => setNextStart(e.target.value)} /></Field>
                <Field label="Ends" htmlFor="ny-end" error={errors.nextEndsOn}><input id="ny-end" type="date" className={INPUT} value={nextEndsOn} onChange={(e) => setNextEnd(e.target.value)} /></Field>
              </div>
            )}
          </fieldset>
        </>
      )}
      {error && <Flash kind="error">{error}</Flash>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onDone}>Cancel</button>
        <button type="submit" className={BTN_DANGER} disabled={busy || blocking.length > 0 || (outstanding.length > 0 && !ack)}>
          {busy ? 'Archiving…' : `Archive ${year.label.replace('-', '–')}`}
        </button>
      </div>
    </form>
  );
}
