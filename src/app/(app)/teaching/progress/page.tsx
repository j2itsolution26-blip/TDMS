import { teachingPolicy } from '@/server/auth/policies';
import { studentProgress } from '@/server/services/teaching/student-support';
import { yearPage } from '@/server/services/teaching/page-context';
import { Card, Chip, Empty, PageShell, TD, TH, Table } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';

export const dynamic = 'force-dynamic';

/** Student Progress — each student's running grade and attendance, per class, with who may need support. */
export default async function StudentProgressPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  const ctx = await yearPage(teachingPolicy.teach, year);
  const classes = await studentProgress(ctx.user, ctx.yearId);

  return (
    <PageShell eyebrow="Academic" title="Student Progress" description="Running grades and attendance for every student you teach. Below the passing grade, or 3+ absences, is flagged for attention." actions={<YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />}>
      {classes.length === 0 && <Empty title="No classes" description="You have no classes in this school year." />}
      {classes.map((c) => {
        const atRisk = c.rows.filter((r) => (r.grade !== null && r.grade < c.passingGrade) || r.absences >= 3).length;
        return (
          <Card key={c.classId} title={`${c.subject} — ${c.detail}`} description={`${c.rows.length} students · passing ${c.passingGrade}${atRisk ? ` · ${atRisk} need attention` : ''}`} padded={false}>
            {c.rows.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-tdms-muted sm:px-6">No students in this class.</p>
            ) : (
              <Table
                label={`Progress in ${c.subject}`}
                head={
                  <>
                    <th scope="col" className={TH}>Student</th>
                    <th scope="col" className={TH}>Running grade</th>
                    <th scope="col" className={TH}>Remarks</th>
                    <th scope="col" className={TH}>Attendance</th>
                    <th scope="col" className={TH}>Absences</th>
                    <th scope="col" className={TH}>Support</th>
                  </>
                }
              >
                {c.rows.map((r) => {
                  const low = r.grade !== null && r.grade < c.passingGrade;
                  return (
                    <tr key={r.studentId}>
                      <td className={TD}><span className="font-semibold">{r.name}</span><span className="block text-xs text-tdms-muted tabular-nums">{r.studentNumber}</span></td>
                      <td className={TD}>
                        <div className="flex items-center gap-2">
                          <span className={`w-14 font-bold tabular-nums ${low ? 'text-red-700' : ''}`}>{r.grade !== null ? r.grade.toFixed(1) : '—'}</span>
                          {r.grade !== null && (
                            <span aria-hidden="true" className="h-2 w-24 overflow-hidden rounded-full bg-tdms-bg">
                              <span className={`block h-full rounded-full ${low ? 'bg-red-500' : 'bg-tdms-green'}`} style={{ width: `${Math.min(100, r.grade)}%` }} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={TD}><Chip status={r.remark} label={r.remarkLabel} /></td>
                      <td className={`${TD} tabular-nums`}>{r.attendanceRate !== null ? `${r.attendanceRate}%` : '—'}</td>
                      <td className={TD}>{r.absences >= 3 ? <Chip status="ABSENT" label={`${r.absences}`} /> : <span className="tabular-nums">{r.absences}</span>}</td>
                      <td className={TD}>{r.openSupport ? <Chip status="IN_PROGRESS" label="Open" /> : <span className="text-xs text-tdms-muted">—</span>}</td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        );
      })}
    </PageShell>
  );
}
