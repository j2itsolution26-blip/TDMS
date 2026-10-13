import { ArchivedNote, PageShell } from '@/components/teaching/kit';
import AttendanceScanner from '@/components/teaching/AttendanceScanner';
import { useParams } from 'react-router-dom';
import { Page } from '@/lib/page-data';
import type { loadTeachingAttendanceId } from '@/server/controllers/pages/app/teaching/attendance/_id';

type Data = Awaited<ReturnType<typeof loadTeachingAttendanceId>>;

function View({ data }: Data) {
  return (
    <PageShell
      back={{ href: '/teaching/attendance', label: 'QR Attendance' }}
      eyebrow={`${data.session.dateLabel} · ${data.session.time}`}
      title={data.cls.subject}
      description={data.cls.detail}
    >
      {data.cls.archived && <ArchivedNote label="of this class" />}
      <AttendanceScanner initial={data} />
    </PageShell>
  );
}

/** /teaching/attendance/[id] */
export default function TeachingAttendanceIdPage() {
  const { id } = useParams() as { id: string };
  return <Page<Data> endpoint={`/teaching/attendance/${id}`} render={(d) => <View {...d} />} />;
}
