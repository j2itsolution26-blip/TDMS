import { ASSESSMENT_KIND_PLURALS, type AssessmentKind } from '@shared/lib/teaching';
import { Page } from '@/lib/page-data';
import type { AssessmentListData } from '@/server/controllers/pages/app/teaching/lists';
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

/** The shared page behind Quizzes, Examinations, Online Activities and Performance Tasks. */
export default function AssessmentListPage({ kind, endpoint }: { kind: AssessmentKind; endpoint: string }) {
  return (
    <Page<AssessmentListData>
      endpoint={endpoint}
      render={(d) => (
        <PageShell eyebrow={GROUPS[kind]} title={ASSESSMENT_KIND_PLURALS[kind]} description={DESCRIPTIONS[kind]} actions={<YearSwitcher years={d.years} current={d.current?.id ?? null} />}>
          {d.archived && d.current && <ArchivedNote label={d.current.label} />}
          <AssessmentList kind={kind} rows={d.rows} classes={d.classes} canCreate={!d.archived} initialClass={d.initialClass} />
        </PageShell>
      )}
    />
  );
}
