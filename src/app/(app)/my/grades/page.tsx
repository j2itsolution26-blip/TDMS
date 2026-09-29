import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentPortalPolicy } from '@/server/auth/policies';
import { requireStudentRecord } from '@/server/services/teaching/access';
import { studentGrades } from '@/server/services/teaching/gradebook';
import { orNotFound } from '@/server/services/teaching/page-context';
import { Card, Chip, Empty, PageShell, TD, TH, Table } from '@/components/teaching/kit';

export const dynamic = 'force-dynamic';

/** A student's released final grades. Unreleased grades are never sent. */
export default async function MyGradesPage() {
  const user = await requireUser();
  authorizePage(studentPortalPolicy.use(user));
  const student = await orNotFound(requireStudentRecord(user));
  const rows = await studentGrades(student.id);

  return (
    <PageShell eyebrow="My Learning" title="My Grades" description="Final grades your instructors have released.">
      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-5 sm:p-6"><Empty title="No released grades yet" description="Grades appear here when your instructors release them. You will be notified." /></div>
        ) : (
          <Table label="Released grades" head={<><th scope="col" className={TH}>Subject</th><th scope="col" className={TH}>School year</th><th scope="col" className={TH}>Semester</th><th scope="col" className={TH}>Instructor</th><th scope="col" className={TH}>Final grade</th><th scope="col" className={TH}>Remarks</th></>}>
            {rows.map((g) => (
              <tr key={g.id}>
                <td className={TD}><span className="font-semibold">{g.subject}</span><span className="block text-xs text-tdms-muted">{g.code}</span></td>
                <td className={`${TD} whitespace-nowrap`}>{g.schoolYear.replace('-', '–')}</td>
                <td className={`${TD} whitespace-nowrap`}>{g.semester}</td>
                <td className={TD}>{g.instructor ?? '—'}</td>
                <td className={`${TD} text-base font-bold tabular-nums`}>{g.percent !== null ? g.percent.toFixed(2) : '—'}</td>
                <td className={TD}><Chip status={g.remark} label={g.remarkLabel} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </PageShell>
  );
}
