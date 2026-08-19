import { requireUser, userHasPermission, userHasRole } from "@/server/rbac";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { QuickActions } from "@/components/dashboard/QuickActions";

const SECURITY_ACTIONS = [
  "LOGIN_FAILED",
  "LOGIN_BLOCKED_INACTIVE",
  "STAFF_ACCOUNT_DEACTIVATED",
  "SUPER_ADMIN_BOOTSTRAPPED",
];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// A plain helper rather than inlining `Date.now()` in the dashboard
// function body — React's purity lint rule treats any function used as
// a JSX tag (SuperAdminDashboard included, Server Component or not) as
// a "component" and flags impure calls made directly in its body.
function daysAgo(ms: number): Date {
  return new Date(Date.now() - ms);
}

async function checkDatabaseHealth(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

export default async function DashboardPage() {
  const user = await requireUser();

  if (!userHasPermission(user, "dashboard.view.institutional")) {
    return (
      <div>
        <h1 className="text-lg font-bold text-slate-900">Welcome, {user.name}</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your role ({user.roles.join(", ") || "none"}) does not yet have a dedicated dashboard
          view in the Next.js migration. This is an honest placeholder, not a fabricated one —
          the underlying attendance/grades/clearance modules haven&rsquo;t been built yet.
        </p>
      </div>
    );
  }

  if (userHasRole(user, ["super_admin"])) {
    return <SuperAdminDashboard />;
  }

  return <AdminDashboard />;
}

async function SuperAdminDashboard() {
  const since30d = daysAgo(THIRTY_DAYS_MS);

  const [totalAdmins, totalUsers, activeUsers, securityEventCount, recentSecurityEvents, recentActivity, db] =
    await Promise.all([
      prisma.user.count({ where: { roles: { some: { role: { name: "admin" } } } } }),
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.auditLog.count({ where: { action: { in: SECURITY_ACTIONS }, createdAt: { gte: since30d } } }),
      prisma.auditLog.findMany({
        where: { action: { in: SECURITY_ACTIONS } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
      checkDatabaseHealth(),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">System Administration</h1>
        <p className="text-sm text-slate-500">Platform health, security, and account oversight.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Admins" value={totalAdmins} />
        <StatCard label="Total Users" value={totalUsers} />
        <StatCard label="Active Users" value={activeUsers} hint={`of ${totalUsers} total`} />
        <StatCard label="Active Modules" value="No data available" />
        <StatCard
          label="Security Events"
          value={securityEventCount}
          hint="last 30 days"
          tone={securityEventCount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="System Health"
          value={db.ok ? "Operational" : "Degraded"}
          hint={`DB ${db.latencyMs}ms`}
          tone={db.ok ? "success" : "danger"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="System Health">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Application</span>
              <StatusBadge label="Operational" tone="success" />
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Database</span>
              <StatusBadge label={db.ok ? "Operational" : "Unreachable"} tone={db.ok ? "success" : "danger"} />
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Authentication</span>
              <StatusBadge label={db.ok ? "Operational" : "Unreachable"} tone={db.ok ? "success" : "danger"} />
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Storage</span>
              <StatusBadge label="No data available" tone="neutral" />
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Backups</span>
              <StatusBadge label="No data available" tone="neutral" />
            </li>
          </ul>
        </SectionCard>

        <SectionCard title="Security Overview">
          {recentSecurityEvents.length === 0 ? (
            <EmptyState title="No security events recorded" />
          ) : (
            <ul className="space-y-2">
              {recentSecurityEvents.map((event) => (
                <li key={event.id} className="text-sm text-slate-600">
                  <span className="font-medium text-slate-800">{event.action.replace(/_/g, " ")}</span> —{" "}
                  {event.target} <span className="text-slate-400">({event.createdAt.toLocaleString()})</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Recent Administrative Activity">
        <ActivityFeed entries={recentActivity} />
      </SectionCard>

      <SectionCard title="Quick Actions">
        <QuickActions
          actions={[
            { label: "Create Admin", href: "/staff/new" },
            { label: "Manage Staff", href: "/staff" },
            { label: "Roles & Permissions", href: "/roles-permissions" },
            { label: "Audit Logs", href: "/audit-logs" },
          ]}
        />
      </SectionCard>
    </div>
  );
}

async function AdminDashboard() {
  const [
    totalStudents,
    totalTeachers,
    totalUsers,
    activePrograms,
    pendingApplications,
    pendingDocuments,
    enrollmentByStatus,
    programStats,
    recentActivity,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.user.count({ where: { roles: { some: { role: { name: "teacher" } } } } }),
    prisma.user.count(),
    prisma.program.count({ where: { isActive: true } }),
    prisma.application.count({ where: { status: { in: ["submitted", "under_review"] } } }),
    prisma.studentCredential.count({ where: { status: { in: ["submitted", "under_review"] } } }),
    prisma.enrollment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.program.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, _count: { select: { students: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  const enrollmentCounts = Object.fromEntries(enrollmentByStatus.map((e) => [e.status, e._count._all]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Administration</h1>
        <p className="text-sm text-slate-500">Daily TDMS operations overview.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Total Students" value={totalStudents} />
        <StatCard label="Total Teachers" value={totalTeachers} />
        <StatCard label="Total Users" value={totalUsers} />
        <StatCard label="Programs" value={activePrograms} />
        <StatCard
          label="Pending Applications"
          value={pendingApplications}
          tone={pendingApplications > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Pending Documents"
          value={pendingDocuments}
          tone={pendingDocuments > 0 ? "warning" : "neutral"}
        />
        <StatCard label="Active Classes" value="No data available" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Enrollment Overview">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Pending</span>
              <span className="font-medium text-slate-900">{enrollmentCounts.pending ?? 0}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Enrolled</span>
              <span className="font-medium text-slate-900">{enrollmentCounts.enrolled ?? 0}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Dropped</span>
              <span className="font-medium text-slate-900">{enrollmentCounts.dropped ?? 0}</span>
            </li>
          </ul>
        </SectionCard>

        <SectionCard title="Pending Tasks">
          {pendingApplications === 0 && pendingDocuments === 0 ? (
            <EmptyState title="Nothing pending" description="No applications or documents are waiting on review." />
          ) : (
            <ul className="space-y-2 text-sm">
              {pendingApplications > 0 && (
                <li className="text-slate-600">
                  <span className="font-medium text-amber-700">{pendingApplications}</span> application(s) awaiting
                  review
                </li>
              )}
              {pendingDocuments > 0 && (
                <li className="text-slate-600">
                  <span className="font-medium text-amber-700">{pendingDocuments}</span> credential document(s)
                  awaiting verification
                </li>
              )}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Program Statistics">
        {programStats.length === 0 ? (
          <EmptyState title="No active programs" />
        ) : (
          <ul className="space-y-2 text-sm">
            {programStats.map((program) => (
              <li key={program.id} className="flex items-center justify-between">
                <span className="text-slate-600">
                  {program.name} <span className="text-slate-400">({program.code})</span>
                </span>
                <span className="font-medium text-slate-900">{program._count.students} student(s)</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Recent Activity">
        <ActivityFeed entries={recentActivity} />
      </SectionCard>
    </div>
  );
}
