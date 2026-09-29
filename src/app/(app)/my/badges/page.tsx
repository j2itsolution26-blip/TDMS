import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentPortalPolicy } from '@/server/auth/policies';
import { requireStudentRecord } from '@/server/services/teaching/access';
import { studentBadges } from '@/server/services/teaching/student-support';
import { orNotFound } from '@/server/services/teaching/page-context';
import { Card, Empty, PageShell } from '@/components/teaching/kit';

export const dynamic = 'force-dynamic';

export default async function MyBadgesPage() {
  const user = await requireUser();
  authorizePage(studentPortalPolicy.use(user));
  const student = await orNotFound(requireStudentRecord(user));
  const badges = await studentBadges(student.id);

  return (
    <PageShell eyebrow="My Learning" title="My Badges" description="Recognition from your Diploma Instructors.">
      {badges.length === 0 ? (
        <Empty title="No badges yet" description="Badges your instructors award you will appear here." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {badges.map((b) => (
            <li key={b.id}>
              <Card className="h-full">
                <div className="flex gap-4 pt-5">
                  <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-tdms-wash text-3xl">{b.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-tdms-ink">{b.label}</p>
                    <p className="text-sm">{b.reason}</p>
                    {b.message && <p className="mt-1 text-sm italic">“{b.message}”</p>}
                    <p className="mt-2 text-xs text-tdms-muted">{b.instructor ?? 'Your instructor'}{b.subject ? ` · ${b.subject}` : ''} · <span className="tabular-nums">{b.awardedOn}</span></p>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
