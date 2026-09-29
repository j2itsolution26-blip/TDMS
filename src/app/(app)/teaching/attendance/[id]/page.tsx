import { notFound } from 'next/navigation';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { sessionView } from '@/server/services/teaching/attendance';
import { orNotFound, queryId } from '@/server/services/teaching/page-context';
import { ArchivedNote, PageShell } from '@/components/teaching/kit';
import AttendanceScanner from '@/components/teaching/AttendanceScanner';

export const dynamic = 'force-dynamic';

/** The scanning screen for one attendance session. */
export default async function AttendanceSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  authorizePage(teachingPolicy.teach(user));
  const id = queryId((await params).id);
  if (!id) notFound();
  const data = await orNotFound(sessionView(user, id));

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
