import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentPortalPolicy } from '@/server/auth/policies';
import { ownAttendance } from '@/server/services/teaching/student-portal';
import { orNotFound } from '@/server/services/teaching/page-context';
import { Card, Chip, Empty, PageShell, Stat, TD, TH, Table } from '@/components/teaching/kit';

export const dynamic = 'force-dynamic';

export default async function MyAttendancePage() {
  const user = await requireUser();
  authorizePage(studentPortalPolicy.use(user));
  const data = await orNotFound(ownAttendance(user));
  const t = data.totals;

  return (
    <PageShell eyebrow="My Learning" title="My Attendance" description="Every class meeting recorded for you.">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Present" value={t.PRESENT} />
        <Stat label="Late" value={t.LATE} tone={t.LATE ? 'attention' : undefined} hint={t.LATE ? 'Arrived after the grace period' : undefined} />
        <Stat label="Absent" value={t.ABSENT} tone={t.ABSENT ? 'failed' : undefined} />
        <Stat label="Excused" value={t.EXCUSED} />
      </div>
      <Card padded={false} title="Attendance history">
        {data.rows.length === 0 ? (
          <div className="px-5 pb-5 sm:px-6"><Empty title="No attendance recorded yet" description="When your instructor scans your QR code, it appears here." /></div>
        ) : (
          <Table label="Attendance history" head={<><th scope="col" className={TH}>Date</th><th scope="col" className={TH}>Subject</th><th scope="col" className={TH}>Class time</th><th scope="col" className={TH}>Status</th><th scope="col" className={TH}>Time in</th><th scope="col" className={TH}>Time out</th></>}>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td className={`${TD} whitespace-nowrap tabular-nums`}>{r.date}</td>
                <td className={`${TD} font-semibold`}>{r.subject}</td>
                <td className={`${TD} whitespace-nowrap`}>{r.time}</td>
                <td className={TD}><Chip status={r.status} label={r.statusLabel} /></td>
                <td className={`${TD} tabular-nums`}>{r.timeIn ?? '—'}</td>
                <td className={`${TD} tabular-nums`}>{r.timeOut ?? '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </PageShell>
  );
}
