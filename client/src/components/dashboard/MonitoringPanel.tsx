import Link from '@/lib/link';
import type { InstitutionMonitoring } from '@/server/services/monitoring';
import type { AnnouncementView } from '@/server/services/announcements';
import { Card, Empty, FOCUS, Stat, TD, TH, Table } from '@/components/teaching/kit';

/**
 * Institutional monitoring — the TVET Director's view, shared with the Admin.
 * Counts only; no class records. Every figure comes from the server.
 */
export default function MonitoringPanel({ m }: { m: InstitutionMonitoring }) {
  const a = m.attendance;
  const rate = (x: typeof a.today) => {
    const marked = x.present + x.late + x.absent + x.excused;
    return marked ? `${Math.round(((x.present + x.late) / marked) * 100)}% present` : 'No meetings recorded';
  };
  const when = (iso: string, allDay: boolean) => new Date(iso).toLocaleString([], allDay ? { month: 'short', day: 'numeric', timeZone: 'UTC' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <section aria-labelledby="monitoring-heading" className="space-y-4">
      <h2 id="monitoring-heading" className="text-lg font-bold text-tdms-ink">Institutional monitoring</h2>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Staff" value={m.staff.active} hint={`${m.staff.deactivated} deactivated`} tone={m.staff.deactivated ? 'attention' : undefined} />
        <Stat label="Instructors" value={m.instructors.active} hint={`${m.instructors.deactivated} deactivated`} tone={m.instructors.deactivated ? 'attention' : undefined} />
        <Stat label="Active students" value={m.students.active} hint={`${m.students.total} on record`} />
        <Stat label="Dropped" value={m.students.dropped} tone={m.students.dropped ? 'failed' : undefined} hint={`${m.students.deactivated} inactive · ${m.students.transferred} transferred`} />
        <Stat label="Present today" value={a.today.present + a.today.late} hint={`${a.today.late} late · ${rate(a.today)}`} tone="success" />
        <Stat label="Absent today" value={a.today.absent} tone={a.today.absent ? 'failed' : undefined} hint={`Last 30 days: ${a.last30Days.absent} absences`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Upcoming assessments" description="Open batches in the next 30 days" actions={<Link href="/assessment/results" className={`text-[13px] font-semibold text-tdms-text hover:underline ${FOCUS}`}>Results</Link>}>
          {m.upcomingAssessments.length === 0 ? <p className="pb-4 text-sm text-tdms-muted">None scheduled.</p> : (
            <ul className="divide-y divide-tdms-hairline pb-2">
              {m.upcomingAssessments.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span><Link href={`/assessment/batches/${b.id}`} className="font-semibold text-tdms-text hover:underline">{b.batchNumber}</Link> <span className="text-tdms-muted">· {b.qualification} · {b.assessorName}</span></span>
                  <span className="whitespace-nowrap tabular-nums text-tdms-muted">{b.date} · {b.candidates} cand.</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Upcoming activities" description="Training, assessments and school calendar, next 14 days">
          {m.upcomingActivities.length === 0 ? <p className="pb-4 text-sm text-tdms-muted">Nothing scheduled.</p> : (
            <ul className="divide-y divide-tdms-hairline pb-2">
              {m.upcomingActivities.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span><Link href={e.href} className="font-semibold text-tdms-ink hover:text-tdms-text hover:underline">{e.title}</Link> <span className="text-tdms-muted">· {e.kind}{e.detail ? ` · ${e.detail}` : ''}</span></span>
                  <span className="whitespace-nowrap tabular-nums text-tdms-muted">{when(e.when, e.allDay)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <Card title="Per course" description="Students by course" padded={false}>
            {m.perCourse.length === 0 ? <div className="p-6"><Empty title="No active courses" /></div> : (
              <Table label="Students per course" head={<><th className={TH}>Course</th><th className={`${TH} text-right`}>Active</th><th className={`${TH} text-right`}>Dropped</th><th className={`${TH} text-right`}>On record</th></>}>
                {m.perCourse.map((p) => (
                  <tr key={p.id}>
                    <td className={TD}><span className="font-semibold">{p.code}</span> <span className="text-tdms-muted">{p.name}</span></td>
                    <td className={`${TD} text-right tabular-nums`}>{p.active}</td>
                    <td className={`${TD} text-right tabular-nums`}>{p.dropped}</td>
                    <td className={`${TD} text-right tabular-nums`}>{p.total}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card title="Staff by role" padded={false}>
            <Table label="Staff by role" head={<><th className={TH}>Role</th><th className={`${TH} text-right`}>Active</th><th className={`${TH} text-right`}>Deactivated</th></>}>
              {m.staffByRole.map((r) => (
                <tr key={r.role}><td className={TD}>{r.label}</td><td className={`${TD} text-right tabular-nums`}>{r.active}</td><td className={`${TD} text-right tabular-nums`}>{r.deactivated}</td></tr>
              ))}
            </Table>
          </Card>
          <Card title="Inventory" actions={<Link href="/assessment/inventory" className={`text-[13px] font-semibold text-tdms-text hover:underline ${FOCUS}`}>Open</Link>}>
            <dl className="grid grid-cols-2 gap-3 pb-4 text-sm">
              <div><dt className="text-tdms-muted">Items</dt><dd className="text-lg font-bold tabular-nums">{m.supplies.inventory.items}</dd></div>
              <div><dt className="text-tdms-muted">On hand</dt><dd className="text-lg font-bold tabular-nums">{m.supplies.inventory.onHand}</dd></div>
              <div><dt className="text-tdms-muted">Defective units</dt><dd className="text-lg font-bold tabular-nums text-red-700">{m.supplies.inventory.defective}</dd></div>
              <div><dt className="text-tdms-muted">Open purchases</dt><dd className="text-lg font-bold tabular-nums">{m.supplies.openPurchases}</dd></div>
            </dl>
            <p className="pb-4 text-xs text-tdms-muted">Scholarship monitoring is not available yet: scholarships are not recorded in TDMS.</p>
          </Card>
        </div>
      </div>
    </section>
  );
}

/** The latest announcements addressed to the viewer. */
export function AnnouncementsCard({ items }: { items: AnnouncementView[] }) {
  if (items.length === 0) return null;
  return (
    <Card title="Announcements" actions={<Link href="/announcements" className={`text-[13px] font-semibold text-tdms-text hover:underline ${FOCUS}`}>View all</Link>}>
      <ul className="divide-y divide-tdms-hairline pb-2">
        {items.map((a) => (
          <li key={a.id} className="py-3">
            <p className="font-semibold text-tdms-ink">{a.title}</p>
            <p className="line-clamp-2 text-[13px] text-tdms-muted">{a.body}</p>
            <p className="mt-0.5 text-xs text-tdms-muted">{new Date(a.createdAt).toLocaleDateString([], { dateStyle: 'medium' })}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
