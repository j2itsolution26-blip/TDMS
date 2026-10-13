import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from '@/lib/navigation';
import { CheckCircle2, CircleAlert, LogIn, LogOut } from 'lucide-react';
import { api } from '@/lib/api-client';
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from '@shared/lib/teaching';
import QrScanner from './QrScanner';
import { BTN, BTN_DANGER, Card, Chip, INPUT, TD, TH, Table } from './kit';

/**
 * The live attendance screen: scan, see who it was and whether it was a time
 * in or a time out, move on. The list and the counts refresh every few
 * seconds, so a second device scanning the same session shows up too.
 */

interface Row {
  studentId: string;
  studentNumber: string;
  name: string;
  status: AttendanceStatus | null;
  timeIn: string | null;
  timeOut: string | null;
  method: string | null;
}

interface Counts {
  roster: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  notYet: number;
}

export interface SessionData {
  session: { id: string; status: string; date: string; dateLabel: string; time: string; startTime: string; endTime: string; lateAfterMinutes: number };
  cls: { id: string; subject: string; detail: string; archived: boolean };
  counts: Counts;
  rows: Row[];
}

interface ScanResponse {
  result: 'TIME_IN' | 'TIME_OUT' | 'ALREADY_IN' | 'ALREADY_COMPLETE';
  student: { name: string; studentNumber: string };
  status: AttendanceStatus;
  statusLabel: string;
  timeIn: string | null;
  timeOut: string | null;
  subject: string;
  counts: Counts;
}

type Last = { kind: 'ok'; data: ScanResponse } | { kind: 'error'; message: string };

export default function AttendanceScanner({ initial }: { initial: SessionData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [last, setLast] = useState<Last | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const inFlight = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const open = data.session.status === 'OPEN' && !data.cls.archived;

  const refresh = useCallback(async () => {
    const r = await api.get<SessionData>(`/api/v1/attendance/sessions/${initial.session.id}`);
    if (r.ok) setData(r.data);
  }, [initial.session.id]);

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(refresh, 5000);
    return () => window.clearInterval(t);
  }, [open, refresh]);

  const submit = useCallback(
    async (value: string) => {
      const v = value.trim();
      if (!v || inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      const r = await api.post<ScanResponse>(`/api/v1/attendance/sessions/${initial.session.id}/scan`, { code: v });
      inFlight.current = false;
      setBusy(false);
      setCode('');
      if (r.ok) {
        setLast({ kind: 'ok', data: r.data });
        setData((d) => ({ ...d, counts: r.data.counts }));
        void refresh();
      } else {
        setLast({ kind: 'error', message: r.message });
      }
      input.current?.focus();
    },
    [initial.session.id, refresh],
  );

  async function mark(studentId: string, status: AttendanceStatus) {
    const r = await api.post(`/api/v1/attendance/sessions/${initial.session.id}/mark`, { studentId, status });
    if (!r.ok) setLast({ kind: 'error', message: r.message });
    void refresh();
  }

  async function close() {
    if (!window.confirm(`Close attendance? The ${data.counts.notYet} student(s) not yet scanned will be marked absent and notified.`)) return;
    setBusy(true);
    const r = await api.post(`/api/v1/attendance/sessions/${initial.session.id}/close`);
    setBusy(false);
    if (!r.ok) return setLast({ kind: 'error', message: r.message });
    await refresh();
    router.refresh();
  }

  async function reopen() {
    setBusy(true);
    // Opening the same meeting again resumes it; its records are kept.
    const r = await api.post<{ id: string }>('/api/v1/attendance/sessions', {
      classId: data.cls.id,
      meetingDate: data.session.date,
      startTime: data.session.startTime,
      endTime: data.session.endTime,
      lateAfterMinutes: data.session.lateAfterMinutes,
    });
    setBusy(false);
    if (!r.ok) return setLast({ kind: 'error', message: r.message });
    await refresh();
  }

  const c = data.counts;
  const rows = data.rows.filter((r) => !filter || `${r.name} ${r.studentNumber}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      <div className="space-y-4 xl:col-span-2">
        <Card title={open ? 'Scan Student QR' : 'Attendance closed'} description={open ? 'Hold the QR inside the frame, or type the student ID.' : 'Reopen to continue scanning.'}>
          {open ? (
            <>
              <QrScanner onCode={submit} paused={busy} />
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(code);
                }}
              >
                <label htmlFor="scan-code" className="sr-only">Student ID or QR code</label>
                <input
                  ref={input}
                  id="scan-code"
                  className={INPUT}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Student ID (or use a handheld scanner)"
                  autoComplete="off"
                  autoFocus
                />
                <button type="submit" className={BTN} disabled={busy || !code.trim()}>
                  Record
                </button>
              </form>
            </>
          ) : (
            <button type="button" className={BTN} onClick={reopen} disabled={busy || data.cls.archived}>
              Reopen attendance
            </button>
          )}
        </Card>

        {last && <ScanCard last={last} />}
      </div>

      <div className="space-y-4 xl:col-span-3">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Live counts" aria-live="polite">
          <li className="rounded-2xl border border-tdms-hairline bg-white p-4 shadow-card">
            <p className="text-[13px] font-semibold text-tdms-muted">Students Present</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-tdms-ink">{c.present + c.late} / {c.roster}</p>
          </li>
          <li className="rounded-2xl border border-tdms-hairline bg-white p-4 shadow-card">
            <p className="text-[13px] font-semibold text-emerald-800">Present</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{c.present}</p>
          </li>
          <li className="rounded-2xl border border-tdms-hairline bg-white p-4 shadow-card">
            <p className="text-[13px] font-semibold text-amber-800">Late</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{c.late}</p>
          </li>
          <li className="rounded-2xl border border-tdms-hairline bg-white p-4 shadow-card">
            <p className="text-[13px] font-semibold text-red-700">{open ? 'Not yet scanned' : 'Absent'}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{open ? c.notYet + c.absent : c.absent}</p>
          </li>
        </ul>

        <Card
          title="Live Attendance"
          description={`${data.cls.subject} · ${data.session.dateLabel} · ${data.session.time}`}
          padded={false}
          actions={
            open ? (
              <button type="button" className={BTN_DANGER} onClick={close} disabled={busy}>
                Close attendance
              </button>
            ) : (
              <Chip status="CLOSED" label="Closed" />
            )
          }
        >
          <div className="px-5 pb-3 sm:px-6">
            <label htmlFor="att-filter" className="sr-only">Find a student</label>
            <input id="att-filter" className={INPUT} placeholder="Find a student…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <Table
            label="Attendance list"
            head={
              <>
                <th scope="col" className={TH}>Student</th>
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={TH}>Time In</th>
                <th scope="col" className={TH}>Time Out</th>
                <th scope="col" className={TH}><span className="sr-only">Change</span></th>
              </>
            }
          >
            {rows.map((r) => (
              <tr key={r.studentId}>
                <td className={TD}>
                  <span className="block font-semibold">{r.name}</span>
                  <span className="text-xs text-tdms-muted tabular-nums">{r.studentNumber}</span>
                </td>
                <td className={TD}>{r.status ? <Chip status={r.status} label={ATTENDANCE_STATUS_LABELS[r.status]} /> : <span className="text-xs text-tdms-muted">Not yet</span>}</td>
                <td className={`${TD} whitespace-nowrap tabular-nums`}>{r.timeIn ?? '—'}</td>
                <td className={`${TD} whitespace-nowrap tabular-nums`}>{r.timeOut ?? '—'}</td>
                <td className={TD}>
                  <label className="sr-only" htmlFor={`mark-${r.studentId}`}>Set status for {r.name}</label>
                  <select
                    id={`mark-${r.studentId}`}
                    className={`${INPUT} w-auto py-1.5 text-xs`}
                    value={r.status ?? ''}
                    disabled={data.cls.archived}
                    onChange={(e) => e.target.value && mark(r.studentId, e.target.value as AttendanceStatus)}
                  >
                    <option value="" disabled>Set…</option>
                    {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}

function ScanCard({ last }: { last: Last }) {
  if (last.kind === 'error') {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
        <CircleAlert className="h-6 w-6 shrink-0 text-red-600" aria-hidden="true" />
        <p className="text-sm font-semibold text-red-800">{last.message}</p>
      </div>
    );
  }
  const d = last.data;
  const isOut = d.result === 'TIME_OUT' || (d.result === 'ALREADY_COMPLETE' && d.timeOut);
  const headline = {
    TIME_IN: 'Attendance Recorded',
    TIME_OUT: 'Time-out Recorded',
    ALREADY_IN: 'Already timed in',
    ALREADY_COMPLETE: 'Attendance already complete',
  }[d.result];
  const fresh = d.result === 'TIME_IN' || d.result === 'TIME_OUT';
  return (
    <div role="status" aria-live="assertive" className={`rounded-2xl border p-5 ${fresh ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-blue-50'}`}>
      <p className={`flex items-center gap-2 text-base font-bold ${fresh ? 'text-emerald-800' : 'text-blue-800'}`}>
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> {headline}
      </p>
      <p className="mt-3 text-xl font-bold text-tdms-ink">{d.student.name}</p>
      <p className="text-sm text-tdms-muted">Student ID: <span className="tabular-nums">{d.student.studentNumber}</span></p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={`rounded-xl p-3 ${!isOut ? 'bg-white ring-2 ring-emerald-500' : 'bg-white/60'}`}>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-tdms-muted"><LogIn className="h-3.5 w-3.5" aria-hidden="true" /> Time In</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-tdms-ink">{d.timeIn ?? '—'}</p>
        </div>
        <div className={`rounded-xl p-3 ${isOut ? 'bg-white ring-2 ring-emerald-500' : 'bg-white/60'}`}>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-tdms-muted"><LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Time Out</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-tdms-ink">{d.timeOut ?? '—'}</p>
        </div>
      </div>
      <p className="mt-3 flex items-center justify-between text-sm">
        <span className="font-semibold text-tdms-ink">{d.subject}</span>
        <Chip status={d.status} label={d.statusLabel} />
      </p>
    </div>
  );
}
