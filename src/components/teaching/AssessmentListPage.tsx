import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { listInstructorAssessments } from '@/server/services/teaching/assessments';
import { yearPage } from '@/server/services/teaching/page-context';
import { ASSESSMENT_KIND_PLURALS, type AssessmentKind } from '@/lib/teaching';
import { ArchivedNote, PageShell } from './kit';
import { YearSwitcher } from './client-kit';
import AssessmentList from './AssessmentList';

const DESCRIPTIONS: Record<AssessmentKind, string> = {
  QUIZ: 'Scheduled quizzes with an exact date, start and end time. Students can open them only inside that window.',
  EXAM: 'Major, midterm, final and practical examinations — scheduled, keyed and checked like quizzes, and kept separate from them.',
  ACTIVITY: 'Online activities: enter, edit and save each student’s score, then finalize and release.',
  PT: 'Performance tasks: record each student’s score, then finalize and release.',
};

const GROUPS: Record<AssessmentKind, string> = { QUIZ: 'Assessments', EXAM: 'Assessments', ACTIVITY: 'Activities', PT: 'Activities' };

/** The shared server page behind Quizzes, Examinations, Online Activities and Performance Tasks. */
export default async function AssessmentListPage({ kind, searchParams }: { kind: AssessmentKind; searchParams: Promise<{ year?: string; class?: string }> }) {
  const sp = await searchParams;
  const ctx = await yearPage(teachingPolicy.teach, sp.year);
  const [classes, rows] = await Promise.all([
    instructorClasses(ctx.user, ctx.yearId),
    listInstructorAssessments(ctx.user, ctx.yearId, [kind]),
  ]);

  return (
    <PageShell eyebrow={GROUPS[kind]} title={ASSESSMENT_KIND_PLURALS[kind]} description={DESCRIPTIONS[kind]} actions={<YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />}>
      {ctx.archived && ctx.current && <ArchivedNote label={ctx.current.label} />}
      <AssessmentList
        kind={kind}
        rows={rows}
        classes={classes.map((c) => ({ id: c.id.toString(), label: `${c.subject.title} — ${classHeading(c).detail}` }))}
        canCreate={!ctx.archived}
        initialClass={sp.class && classes.some((c) => c.id.toString() === sp.class) ? sp.class : null}
      />
    </PageShell>
  );
}
