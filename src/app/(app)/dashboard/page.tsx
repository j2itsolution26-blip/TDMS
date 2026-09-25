import Link from 'next/link';
import { requireUser } from '@/server/auth/current-user';
import { getDashboardData } from '@/server/services/dashboard-service';
import { studentPolicy, userPolicy, applicationPolicy } from '@/server/auth/policies';
import { Card, StatCard, EmptyState, Badge } from '@/components/ui';
import { diffForHumans, humanizeAction } from '@/lib/dates';

/** Port of resources/views/livewire/dashboard.blade.php. */
export const dynamic = 'force-dynamic';

const ICON = {
  students: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  programs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347M8.288 14.212A5.25 5.25 0 1117.712 9.788a5.25 5.25 0 01-9.424 4.424z" />
    </svg>
  ),
  staff: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  applications: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  enrolled: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  plus: (
    <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
};

function weeklyChange(n: number | null): string {
  return n ? `+${n} this week` : 'No change this week';
}

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboardData(user);
  const s = data.stats;

  const showKpis =
    data.canViewStudents || data.canViewPrograms || data.canViewStaff || data.canViewApplications;

  const breakdownTotal = data.applicationBreakdown
    ? data.applicationBreakdown.approved +
      data.applicationBreakdown.submitted +
      data.applicationBreakdown.returned
    : 0;
  const pct = (n: number) => (breakdownTotal > 0 ? Math.round((n / breakdownTotal) * 10000) / 100 : 0);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl sm:text-[28px] font-semibold text-navy-900 leading-tight">
          {data.greeting}, {user.name.split(' ')[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here&apos;s what&apos;s happening in your TDMS account today — {data.today}.
        </p>
      </div>

      {data.student && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <p className="text-sm text-slate-500">Program</p>
              <p className="mt-1 font-semibold text-navy-900">
                {data.student.program?.name ?? 'Not assigned'}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Year Level</p>
              <p className="mt-1 font-semibold text-navy-900">{data.student.yearLevel} Year</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Status</p>
              <p className="mt-1">
                <Badge status={data.student.status} />
              </p>
            </Card>
          </div>

          <Card padding="p-0">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-navy-900">My Subjects</h2>
              <Link
                href={`/students/${data.student.id}/enrollment`}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                View Enrollment
              </Link>
            </div>

            {data.mySubjects.length === 0 ? (
              <EmptyState
                title="No subjects yet"
                description="Curriculum subjects for your year level will appear here once assigned."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Subject</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Semester</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Units</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.mySubjects.map((cs) => (
                      <tr key={cs.id}>
                        {/*
                          The Blade read $cs->subject->name, but Subject has no
                          `name` column — only `title` — so this cell always
                          rendered the em-dash fallback. Corrected here.
                        */}
                        <td className="px-6 py-3.5 text-sm font-medium text-navy-900">
                          {cs.subject.title || '—'}
                        </td>
                        <td className="px-6 py-3.5 text-sm text-slate-500">{cs.semester}</td>
                        <td className="px-6 py-3.5 text-sm text-slate-500">{cs.units.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {showKpis && (
        <>
          {/* KPI row 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.canViewStudents && (
              <StatCard
                label="Total Students"
                value={s.totalStudents}
                change={weeklyChange(s.totalStudentsNew)}
                trend={s.totalStudentsNew ? 'up' : null}
                icon={ICON.students}
              />
            )}
            {data.canViewPrograms && (
              <StatCard
                label="Programs"
                value={s.programs}
                change={weeklyChange(s.programsNew)}
                trend={s.programsNew ? 'up' : null}
                icon={ICON.programs}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
              />
            )}
            {data.canViewStaff && (
              <StatCard
                label="Staff Members"
                value={s.staff}
                change={weeklyChange(s.staffNew)}
                trend={s.staffNew ? 'up' : null}
                icon={ICON.staff}
                iconBg="bg-amber-50"
                iconColor="text-amber-600"
              />
            )}
            {data.canViewApplications && (
              <StatCard
                label="Active Applications"
                value={s.activeApplications}
                change="Awaiting decision"
                icon={ICON.applications}
                iconBg="bg-indigo-50"
                iconColor="text-indigo-600"
              />
            )}
          </div>

          {/* KPI row 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.canViewApplications && (
              <StatCard
                label="Pending Applications"
                value={s.pendingApplications}
                icon={ICON.clock}
                iconBg="bg-amber-50"
                iconColor="text-amber-600"
              />
            )}
            {data.canViewStudents && (
              <StatCard
                label="Enrolled Students"
                value={s.enrolledStudents}
                icon={ICON.enrolled}
                iconBg="bg-green-50"
                iconColor="text-green-600"
              />
            )}
            {s.credentialsToReview !== null && (
              <StatCard
                label="Credentials to Review"
                value={s.credentialsToReview}
                icon={ICON.shield}
                iconBg="bg-red-50"
                iconColor="text-red-600"
              />
            )}
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {data.canViewStaff && (
            <Card padding="p-0">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-base font-semibold text-navy-900">Recent Activity</h2>
              </div>

              {data.recentActivity.length === 0 ? (
                <EmptyState
                  title="No recent activity"
                  description="System activity will appear here as it happens."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {data.recentActivity.map((log) => (
                    <li key={log.id} className="px-6 py-4 flex gap-3">
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-navy-900">{humanizeAction(log.action)}</p>
                        <p className="text-sm text-slate-500 truncate">{log.target}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{diffForHumans(log.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {data.applicationBreakdown && (
            <Card>
              <h2 className="text-base font-semibold text-navy-900 mb-5">Application Overview</h2>

              {breakdownTotal === 0 ? (
                <EmptyState title="No applications yet" />
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-8">
                  <div
                    className="relative w-36 h-36 shrink-0 rounded-full"
                    style={{
                      background: `conic-gradient(#16A34A 0 ${pct(data.applicationBreakdown.approved)}%, #D97706 ${pct(data.applicationBreakdown.approved)}% ${pct(data.applicationBreakdown.approved) + pct(data.applicationBreakdown.submitted)}%, #DC2626 ${pct(data.applicationBreakdown.approved) + pct(data.applicationBreakdown.submitted)}% 100%)`,
                    }}
                  >
                    <div className="absolute inset-3 rounded-full bg-card flex flex-col items-center justify-center">
                      <span className="text-2xl font-semibold text-navy-900">{breakdownTotal}</span>
                      <span className="text-xs text-slate-500">Total</span>
                    </div>
                  </div>

                  <div className="flex-1 w-full space-y-3">
                    {(
                      [
                        ['Approved', 'bg-green-600', data.applicationBreakdown.approved],
                        ['Pending', 'bg-amber-600', data.applicationBreakdown.submitted],
                        ['Returned', 'bg-red-600', data.applicationBreakdown.returned],
                      ] as const
                    ).map(([label, dot, value]) => (
                      <div key={label} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-600">
                          <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                          {label}
                        </span>
                        <span className="font-medium text-navy-900">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {(data.canViewStudents || data.canViewApplications || data.canViewStaff) && (
            <Card>
              <h2 className="text-base font-semibold text-navy-900 mb-4">Quick Actions</h2>
              <div className="space-y-2">
                {studentPolicy.create(user) && (
                  <Link href="/students" className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-indigo-600 rounded-lg px-3 py-2 hover:bg-slate-50">
                    {ICON.plus}
                    Add New Student
                  </Link>
                )}
                {userPolicy.create(user) && (
                  <Link href="/staff" className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-indigo-600 rounded-lg px-3 py-2 hover:bg-slate-50">
                    {ICON.plus}
                    Create Staff Account
                  </Link>
                )}
                {applicationPolicy.viewAny(user) && (
                  <Link href="/applications" className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-indigo-600 rounded-lg px-3 py-2 hover:bg-slate-50">
                    {ICON.plus}
                    Manage Applications
                  </Link>
                )}
              </div>
            </Card>
          )}

          {data.systemHealth && (
            <Card>
              <h2 className="text-base font-semibold text-navy-900 mb-4">System Health</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Database</span>
                  <Badge
                    status={data.systemHealth.database ? 'active' : 'failed'}
                    label={data.systemHealth.database ? 'Healthy' : 'Down'}
                  />
                </div>
                {data.systemHealth.storageUsedPercent !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Storage</span>
                    <span className="font-medium text-navy-900">
                      {data.systemHealth.storageUsedPercent}% Used
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
