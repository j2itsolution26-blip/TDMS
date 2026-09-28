import Link from 'next/link';
import { requireUser, authorizePage } from '@/server/auth/current-user';
import { enrollmentPolicy, studentPolicy } from '@/server/auth/policies';
import { listAllEnrollments } from '@/server/services/enrollment-service';
import { Badge, Card, EmptyState, PageHeader, Pagination } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { ENROLLMENT_STATUSES } from '@/types/domain';

/**
 * Enrollments — every student's term enrollments in one list.
 *
 * Read-only, under the same policy as each student's enrollment tab
 * (enrollmentPolicy.viewAny). Approving or dropping still happens on the
 * student's record, where the check for verified credentials lives; each row
 * links there.
 */
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = { pending: 'Pending', enrolled: 'Enrolled', dropped: 'Dropped' };

export default async function EnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const user = await requireUser();
  authorizePage(enrollmentPolicy.viewAny(user));

  const params = await searchParams;
  const status = (ENROLLMENT_STATUSES as readonly string[]).includes(params.status ?? '') ? params.status! : '';
  const parsed = Number(params.page ?? 1);
  const data = await listAllEnrollments({ page: Number.isFinite(parsed) && parsed > 0 ? parsed : 1, status: status || undefined });
  const canOpenStudent = studentPolicy.view(user);

  const filters = [{ value: '', label: 'All' }, ...ENROLLMENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))];

  return (
    <div className="space-y-6">
      <PageHeader title="Enrollments" subtitle="Term enrollments across all students. Open a student to approve or change one." />

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = f.value === status;
          return (
            <Link
              key={f.value || 'all'}
              href={f.value ? `/enrollments?status=${f.value}` : '/enrollments'}
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 ${
                active ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      <Card padding="p-0">
        {data.rows.length === 0 ? (
          <EmptyState
            title={status ? `No ${STATUS_LABELS[status]?.toLowerCase() ?? status} enrollments` : 'No enrollments yet'}
            description="Enrollments are created from a student's record, one per school year and semester."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Student</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Program</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Term</th>
                    <th scope="col" className="hidden px-6 py-3 text-left text-xs font-medium uppercase text-slate-500 sm:table-cell">Created</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-6 py-3.5 text-sm">
                        {canOpenStudent ? (
                          <Link href={`/students/${row.student.id}/enrollment`} className="font-medium text-primary-700 hover:underline">
                            {row.student.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-navy-900">{row.student.name}</span>
                        )}
                        <p className="text-xs text-slate-500">{row.student.studentNumber}</p>
                      </td>
                      <td className="px-6 py-3.5 text-sm text-slate-600">{row.student.programCode}</td>
                      <td className="px-6 py-3.5 text-sm text-slate-600">
                        SY {row.schoolYear} · Semester {row.semester}
                        <p className="text-xs text-slate-500">Year {row.yearLevel}</p>
                      </td>
                      <td className="hidden px-6 py-3.5 text-sm text-slate-600 sm:table-cell">{formatDate(row.createdAt)}</td>
                      <td className="px-6 py-3.5">
                        <Badge status={row.status} label={STATUS_LABELS[row.status]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} lastPage={data.lastPage} total={data.total} basePath="/enrollments" query={{ status: status || undefined }} />
          </>
        )}
      </Card>
    </div>
  );
}
