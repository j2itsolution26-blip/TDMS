import Link from 'next/link';
import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { gradebook } from '@/server/services/teaching/gradebook';
import { queryId, yearPage } from '@/server/services/teaching/page-context';
import { ASSESSMENT_KINDS, ASSESSMENT_KIND_PLURALS } from '@/lib/teaching';
import { ArchivedNote, BTN, BTN_SECONDARY, Card, Chip, Empty, PageShell, TD, TH, Table } from '@/components/teaching/kit';
import { ClassPicker, YearSwitcher } from '@/components/teaching/client-kit';

export const dynamic = 'force-dynamic';

/**
 * Class Records — the whole record of a class in one table: who each student
 * is, their attendance, each category's standing, the final grade and remarks.
 * Records are created and changed where they are made (attendance, the
 * assessments, the gradebook); this is where they are read together.
 */
export default async function ClassRecordsPage({ searchParams }: { searchParams: Promise<{ class?: string; year?: string }> }) {
  const sp = await searchParams;
  const ctx = await yearPage(teachingPolicy.teach, sp.year);
  const classes = await instructorClasses(ctx.user, ctx.yearId);
  const picked = classes.find((c) => c.id === queryId(sp.class)) ?? classes[0] ?? null;
  const book = picked ? await gradebook(ctx.user, picked.id) : null;

  return (
    <PageShell
      eyebrow="Teaching"
      title="Class Records"
      description="Student list, attendance, activities, quizzes, exams, performance tasks, grades and remarks for a class."
      actions={
        <>
          <YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />
          {classes.length > 0 && <ClassPicker classes={classes.map((c) => ({ id: c.id.toString(), label: `${c.subject.title} — ${classHeading(c).detail}` }))} current={picked?.id.toString() ?? null} />}
        </>
      }
    >
      {book?.cls.archived && <ArchivedNote label={book.cls.schoolYear} />}
      {!book ? (
        <Empty title="No classes" description="You have no classes in this school year." />
      ) : (
        <Card
          title={`${book.cls.subject} — ${book.cls.detail}`}
          description={`${book.cls.schoolYear.replace('-', '–')} · ${book.cls.semester} · ${book.rows.length} students · ${book.sessions} meetings`}
          padded={false}
          actions={
            <>
              <a href={`/api/classes/${book.cls.id}/grades/export`} className={BTN_SECONDARY}>Export</a>
              <Link href={`/teaching/gradebook?class=${book.cls.id}`} className={BTN}>Edit in gradebook</Link>
            </>
          }
        >
          {book.rows.length === 0 ? (
            <div className="px-5 pb-5 sm:px-6"><Empty title="No students in this class" /></div>
          ) : (
            <Table
              label="Class record"
              head={
                <>
                  <th scope="col" className={TH}>Student ID</th>
                  <th scope="col" className={TH}>Full Name</th>
                  <th scope="col" className={TH}>Program</th>
                  <th scope="col" className={TH}>Year Level</th>
                  <th scope="col" className={TH}>Section</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}>Attendance</th>
                  {ASSESSMENT_KINDS.map((k) => <th key={k} scope="col" className={TH}>{ASSESSMENT_KIND_PLURALS[k]}</th>)}
                  <th scope="col" className={TH}>Grade</th>
                  <th scope="col" className={TH}>Remarks</th>
                </>
              }
            >
              {book.rows.map((r) => (
                <tr key={r.studentId}>
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>{r.studentNumber}</td>
                  <td className={`${TD} whitespace-nowrap font-semibold`}>{r.name}</td>
                  <td className={TD}>{r.program}</td>
                  <td className={`${TD} whitespace-nowrap`}>{r.yearLevel}</td>
                  <td className={TD}>{book.cls.section}</td>
                  <td className={TD}><Chip status={r.status} label={r.statusLabel} /></td>
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>
                    {r.attendance.rate !== null ? `${r.attendance.rate}%` : '—'}
                    <span className="block text-xs text-tdms-muted">P {r.attendance.present} · L {r.attendance.late} · A {r.attendance.absent}</span>
                  </td>
                  {ASSESSMENT_KINDS.map((k) => <td key={k} className={`${TD} tabular-nums`}>{r.categories[k] !== null ? `${r.categories[k]}%` : '—'}</td>)}
                  <td className={`${TD} font-bold tabular-nums`}>{r.finalGrade !== null ? r.finalGrade.toFixed(2) : '—'}</td>
                  <td className={TD}>
                    <Chip status={r.remark} label={r.remarkLabel} />
                    {r.note && <span className="mt-1 block text-xs text-tdms-muted">{r.note}</span>}
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
