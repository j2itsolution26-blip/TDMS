import { classHeading } from '@shared/lib/teaching-labels';
import { ArchivedNote, Empty, PageShell } from '@/components/teaching/kit';
import { ClassPicker, YearSwitcher } from '@/components/teaching/client-kit';
import GradebookScreen from '@/components/teaching/GradebookScreen';
import { Page } from '@/lib/page-data';
import type { loadTeachingGradebook } from '@/server/controllers/pages/app/teaching/gradebook';

type Data = Awaited<ReturnType<typeof loadTeachingGradebook>>;

function View({ book, classes, ctx, picked }: Data) {
  return (
    <PageShell
      eyebrow="Teaching"
      title="Gradebook"
      description={book ? `${book.cls.subject} · ${book.cls.detail}` : 'Scores and final grades for your classes.'}
      actions={
        <>
          <YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />
          {classes.length > 0 && <ClassPicker label="Class / section" classes={classes.map((c) => ({ id: c.id.toString(), label: `${c.subject.title} — ${classHeading(c).detail}` }))} current={picked?.id.toString() ?? null} />}
        </>
      }
    >
      {book?.cls.archived && <ArchivedNote label={book.cls.schoolYear} />}
      {!book ? <Empty title="No classes" description="You have no classes in this school year." /> : <GradebookScreen key={book.cls.id} data={book} />}
    </PageShell>
  );
}

/** /teaching/gradebook */
export default function TeachingGradebookPage() {
  return <Page<Data> endpoint={'/teaching/gradebook'} render={(d) => <View {...d} />} />;
}
