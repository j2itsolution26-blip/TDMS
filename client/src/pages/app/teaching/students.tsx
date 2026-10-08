import { ArchivedNote, Card, Chip, PageShell, TD, TH, Table } from '@/components/teaching/kit';
import { YearSwitcher } from '@/components/teaching/client-kit';
import StudentsScreen from '@/components/teaching/StudentsScreen';
import { Page } from '@/lib/page-data';
import type { loadTeachingStudents } from '@/server/controllers/pages/app/teaching/students';

type Data = Awaited<ReturnType<typeof loadTeachingStudents>>;

function View({ ctx, data, requests }: Data) {
  return (
    <PageShell
      eyebrow="Academic"
      title="Students"
      description="Students in your classes. Status changes you recommend go to the TVET Director, Coordinator and Secretary for approval."
      actions={<YearSwitcher years={ctx.years} current={ctx.current?.id.toString() ?? null} />}
    >
      {ctx.archived && ctx.current && <ArchivedNote label={ctx.current.label} />}
      <StudentsScreen students={data.students} classes={data.classes} archived={ctx.archived} />
      <Card title="My status recommendations" description="Requests you submitted and their decisions" padded={false}>
        {requests.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-tdms-muted sm:px-6">You have not submitted any status recommendations.</p>
        ) : (
          <Table
            label="Status recommendations"
            head={
              <>
                <th scope="col" className={TH}>Student</th>
                <th scope="col" className={TH}>Change</th>
                <th scope="col" className={TH}>Reason</th>
                <th scope="col" className={TH}>Submitted</th>
                <th scope="col" className={TH}>Status</th>
              </>
            }
          >
            {requests.map((r) => (
              <tr key={r.id}>
                <td className={TD}><span className="font-semibold">{r.student}</span><span className="block text-xs text-tdms-muted">{r.studentNumber}</span></td>
                <td className={`${TD} whitespace-nowrap`}>{r.currentStatus} → <span className="font-semibold">{r.requestedStatus}</span></td>
                <td className={`${TD} max-w-xs text-[13px]`}>{r.reason}</td>
                <td className={`${TD} whitespace-nowrap text-[13px]`}>{r.createdAt.slice(0, 10)}</td>
                <td className={TD}>
                  <Chip status={r.status} label={r.statusLabel} />
                  {r.decisionNote && <span className="mt-1 block text-xs text-tdms-muted">{r.decidedBy}: {r.decisionNote}</span>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </PageShell>
  );
}

/** /teaching/students */
export default function TeachingStudentsPage() {
  return <Page<Data> endpoint={'/teaching/students'} render={(d) => <View {...d} />} />;
}
