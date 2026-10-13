import Link from '@/lib/link';
import { classHeading } from '@shared/lib/teaching-labels';
import { dateColumnKey, localDayKey } from '@shared/lib/institution-time';
import { formatClock } from '@shared/lib/teaching';
import { ArchivedNote, Card, Chip, Empty, FOCUS, PageShell } from '@/components/teaching/kit';
import OpenSessionForm from '@/components/teaching/OpenSessionForm';
import { Page } from '@/lib/page-data';
import type { loadTeachingAttendance } from '@/server/controllers/pages/app/teaching/attendance';

type Data = Awaited<ReturnType<typeof loadTeachingAttendance>>;

function View({ byId, classes, ctx, now, open, sp, time, weekday }: Data) {
  return (
    <PageShell eyebrow="Attendance" title="QR Attendance" description="Open a class meeting's attendance and scan each student's QR code. A second scan records the time-out.">
      {ctx.archived && ctx.current && <ArchivedNote label={ctx.current.label} />}

      {open.length > 0 && (
        <Card title="Open sessions" description="Attendance still being taken">
          <ul className="divide-y divide-tdms-hairline">
            {open.map((s) => {
              const c = byId.get(s.classId.toString())!;
              return (
                <li key={s.id.toString()} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold text-tdms-ink">{c.subject.title} <span className="font-normal text-tdms-muted">· {classHeading(c).detail}</span></p>
                    <p className="text-[13px] text-tdms-muted">{dateColumnKey(s.meetingDate)} · {formatClock(s.startTime)} – {formatClock(s.endTime)} · {s._count.records} recorded</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip status="OPEN" label="Open" />
                    <Link href={`/teaching/attendance/${s.id}`} className={`rounded-lg bg-tdms-text px-3 py-2 text-xs font-semibold text-white hover:bg-[#0B6A45] ${FOCUS}`}>
                      Continue scanning
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card title="Start Attendance" description="Times default to the class schedule for today.">
        {classes.length === 0 ? (
          <Empty title="No classes" description="You have no classes in this school year." />
        ) : (
          <OpenSessionForm
            today={localDayKey(now)}
            initial={{ classId: sp.class ?? null, start: time(sp.start), end: time(sp.end) }}
            classes={classes.map((c) => ({
              id: c.id.toString(),
              label: `${c.subject.title} — ${classHeading(c).detail}`,
              today: c.schedules.filter((s) => s.dayOfWeek === weekday).map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
              any: c.schedules[0] ? { startTime: c.schedules[0].startTime, endTime: c.schedules[0].endTime } : null,
            }))}
          />
        )}
      </Card>
    </PageShell>
  );
}

/** /teaching/attendance */
export default function TeachingAttendancePage() {
  return <Page<Data> endpoint={'/teaching/attendance'} render={(d) => <View {...d} />} />;
}
