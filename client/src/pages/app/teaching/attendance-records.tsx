import Link from '@/lib/link';
import { classHeading } from '@shared/lib/teaching-labels';
import { Card, Chip, Empty, FOCUS, PageShell, TD, TH, Table } from '@/components/teaching/kit';
import { ClassPicker, YearSwitcher } from '@/components/teaching/client-kit';
import { Page } from '@/lib/page-data';
import type { loadTeachingAttendanceRecords } from '@/server/controllers/pages/app/teaching/attendance-records';

type Data = Awaited<ReturnType<typeof loadTeachingAttendanceRecords>>;

function View({ classes, ctx, data, picked }: Data) {
  return (
    <PageShell
      eyebrow="Attendance"
      title="Attendance Records"
      description="Each meeting of a class, with who was present, late and absent."
      actions={
        <>
          <YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />
          {classes.length > 0 && <ClassPicker classes={classes.map((c) => ({ id: c.id.toString(), label: `${c.subject.title} — ${classHeading(c).detail}` }))} current={picked?.id.toString() ?? null} />}
        </>
      }
    >
      {!data ? (
        <Empty title="No classes" description="You have no classes in this school year." />
      ) : (
        <Card title={data.cls.subject.title} description={`${classHeading(data.cls).detail} · ${data.roster} students`} padded={false}>
          {data.sessions.length === 0 ? (
            <div className="px-5 pb-5 sm:px-6"><Empty title="No attendance taken yet" description="Sessions appear here once you start attendance for this class." /></div>
          ) : (
            <Table
              label="Attendance sessions"
              head={
                <>
                  <th scope="col" className={TH}>Date</th>
                  <th scope="col" className={TH}>Time</th>
                  <th scope="col" className={TH}>Present</th>
                  <th scope="col" className={TH}>Late</th>
                  <th scope="col" className={TH}>Absent</th>
                  <th scope="col" className={TH}>Excused</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}><span className="sr-only">Open</span></th>
                </>
              }
            >
              {data.sessions.map((s) => (
                <tr key={s.id}>
                  <td className={`${TD} whitespace-nowrap font-semibold tabular-nums`}>{s.date}</td>
                  <td className={`${TD} whitespace-nowrap`}>{s.time}</td>
                  <td className={`${TD} tabular-nums`}>{s.counts.present}</td>
                  <td className={`${TD} tabular-nums`}>{s.counts.late}</td>
                  <td className={`${TD} tabular-nums`}>{s.counts.absent}</td>
                  <td className={`${TD} tabular-nums`}>{s.counts.excused}</td>
                  <td className={TD}><Chip status={s.status} label={s.status === 'OPEN' ? 'Open' : 'Closed'} /></td>
                  <td className={`${TD} text-right`}>
                    <Link href={`/teaching/attendance/${s.id}`} className={`rounded-md text-[13px] font-semibold text-tdms-text hover:underline ${FOCUS}`}>View</Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}
    </PageShell>
  );
}

/** /teaching/attendance-records */
export default function TeachingAttendanceRecordsPage() {
  return <Page<Data> endpoint={'/teaching/attendance-records'} render={(d) => <View {...d} />} />;
}
