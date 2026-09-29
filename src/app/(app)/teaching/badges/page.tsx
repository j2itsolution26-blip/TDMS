import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, classRoster, instructorClasses, studentName } from '@/server/services/teaching/access';
import { instructorBadges } from '@/server/services/teaching/student-support';
import { yearPage } from '@/server/services/teaching/page-context';
import { Card, Empty, PageShell } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import BadgeAward from '@/components/teaching/BadgeAward';

export const dynamic = 'force-dynamic';

/** Badges — recognise students in your classes; each award notifies the student. */
export default async function BadgesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  const ctx = await yearPage(teachingPolicy.teach, year);
  const [classes, badges] = await Promise.all([instructorClasses(ctx.user, ctx.yearId), instructorBadges(ctx.user, ctx.yearId)]);
  const rosters = await Promise.all(classes.map((c) => classRoster(c.sectionId)));

  return (
    <PageShell
      eyebrow="Engagement"
      title="Badges"
      description="Recognise achievement. The student is notified and the badge appears on their dashboard."
      actions={
        <>
          <YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />
          {!ctx.archived && (
            <BadgeAward
              classes={classes.map((c, i) => ({
                id: c.id.toString(),
                label: `${c.subject.title} — ${classHeading(c).detail}`,
                students: rosters[i]!.map((s) => ({ id: s.id.toString(), name: `${studentName(s)} · ${s.studentNumber}` })),
              }))}
            />
          )}
        </>
      }
    >
      <Card title="Badges you awarded" description={`${badges.length} this school year`}>
        {badges.length === 0 ? (
          <Empty title="No badges yet" description="Use “Award Badge” to recognise a student." />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {badges.map((b) => (
              <li key={b.id} className="flex gap-3 rounded-xl border border-tdms-hairline p-4">
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tdms-wash text-2xl">{b.emoji}</span>
                <div className="min-w-0">
                  <p className="font-bold text-tdms-ink">{b.label}</p>
                  <p className="text-sm"><span className="font-semibold">{b.student}</span> <span className="text-tdms-muted">· {b.studentNumber}</span></p>
                  <p className="text-[13px] text-tdms-muted">{b.reason}{b.subject ? ` · ${b.subject}` : ''}</p>
                  {b.message && <p className="mt-1 text-[13px] italic text-tdms-ink">“{b.message}”</p>}
                  <p className="mt-1 text-xs text-tdms-muted tabular-nums">{b.awardedOn}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
