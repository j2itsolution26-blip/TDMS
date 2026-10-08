import { Card, Chip, Empty, PageShell, TD, TH, Table } from '@/components/teaching/kit';
import { Page } from '@/lib/page-data';
import type { loadMyGrades } from '@/server/controllers/pages/app/my/grades';

type Data = Awaited<ReturnType<typeof loadMyGrades>>;

function View({ rows }: Data) {
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

/** /my/grades */
export default function MyGradesPage() {
  return <Page<Data> endpoint={'/my/grades'} render={(d) => <View {...d} />} />;
}
