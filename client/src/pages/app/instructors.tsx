import { useState } from 'react';
import Link from '@/lib/link';
import { ACCOUNT_STATUS_LABELS, type AccountStatus } from '@shared/types/domain';
import { Card, Chip, Empty, FOCUS, INPUT, PageShell, TD, TH, Table } from '@/components/teaching/kit';
import { Page } from '@/lib/page-data';
import type { loadInstructors } from '@/server/controllers/pages/app/instructors';

type Data = Awaited<ReturnType<typeof loadInstructors>>;

function View({ rows, roles }: Data) {
  const [role, setRole] = useState('');
  const shown = role ? rows.filter((r) => r.roles.includes(role)) : rows;
  return (
    <PageShell eyebrow="Academic Oversight" title="Staff Profiles (PDS)" description="Personal Data Sheets of the staff whose profiles reflect to you. Opening a sheet is recorded in the audit trail.">
      <Card
        padded={false}
        title={`${shown.length} ${shown.length === 1 ? 'profile' : 'profiles'}`}
        actions={roles.length > 1 && (
          <>
            <label htmlFor="pds-role" className="sr-only">Role</label>
            <select id="pds-role" className={`${INPUT} w-auto`} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All roles</option>
              {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </>
        )}
      >
        {shown.length === 0 ? (
          <div className="px-5 pb-5 sm:px-6"><Empty title="No staff profiles to show" /></div>
        ) : (
          <Table label="Staff profiles" head={<><th scope="col" className={TH}>Name</th><th scope="col" className={TH}>Role</th><th scope="col" className={TH}>Employee ID</th><th scope="col" className={TH}>Classes</th><th scope="col" className={TH}>PDS completion</th><th scope="col" className={TH}>Account</th><th scope="col" className={TH}><span className="sr-only">Open</span></th></>}>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className={TD}><span className="font-semibold">{r.name}</span><span className="block text-xs text-tdms-muted">{r.email}</span></td>
                <td className={TD}>{r.roleLabels.join(', ')}</td>
                <td className={`${TD} tabular-nums`}>{r.employeeId ?? '—'}</td>
                <td className={`${TD} tabular-nums`}>{r.classes ?? '—'}</td>
                <td className={TD}>
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-2 w-24 overflow-hidden rounded-full bg-tdms-bg"><span className="block h-full rounded-full bg-tdms-green" style={{ width: `${r.completion}%` }} /></span>
                    <span className="text-sm font-semibold tabular-nums">{r.completion}%</span>
                  </div>
                </td>
                <td className={TD}><Chip status={r.status} label={ACCOUNT_STATUS_LABELS[r.status as AccountStatus] ?? r.status} /></td>
                <td className={`${TD} text-right`}><Link href={`/instructors/${r.id}`} className={`rounded text-[13px] font-semibold text-tdms-text hover:underline ${FOCUS}`}>View PDS</Link></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </PageShell>
  );
}

/** /instructors */
export default function InstructorsPage() {
  return <Page<Data> endpoint={'/instructors'} render={(d) => <View {...d} />} />;
}
