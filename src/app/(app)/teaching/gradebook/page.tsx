import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { gradebook } from '@/server/services/teaching/gradebook';
import { queryId, yearPage } from '@/server/services/teaching/page-context';
import { ArchivedNote, Empty, PageShell } from '@/components/teaching/kit';
import { ClassPicker, YearSwitcher } from '@/components/teaching/client-kit';
import GradebookScreen from '@/components/teaching/GradebookScreen';

export const dynamic = 'force-dynamic';

/** The Instructor Gradebook, one class at a time (the class picker is the section filter). */
export default async function GradebookPage({ searchParams }: { searchParams: Promise<{ class?: string; year?: string }> }) {
  const sp = await searchParams;
  const ctx = await yearPage(teachingPolicy.teach, sp.year);
  const classes = await instructorClasses(ctx.user, ctx.yearId);
  const picked = classes.find((c) => c.id === queryId(sp.class)) ?? classes[0] ?? null;
  const book = picked ? await gradebook(ctx.user, picked.id) : null;

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
