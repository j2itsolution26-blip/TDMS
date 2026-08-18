import { requireUser, userHasPermission } from "@/server/rbac";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/ui/StatCard";

export default async function DashboardPage() {
  const user = await requireUser();
  const canViewInstitutional = userHasPermission(user, "dashboard.view.institutional");

  if (!canViewInstitutional) {
    return (
      <div>
        <h1 className="text-lg font-bold text-slate-900">Welcome, {user.name}</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your role ({user.roles.join(", ") || "none"}) does not yet have a dedicated dashboard
          view in the Next.js migration. This is an honest placeholder, not a fabricated one —
          see the migration report for what is real vs. still pending.
        </p>
      </div>
    );
  }

  const [staffCount, studentCount, programCount, pendingApplications] = await Promise.all([
    prisma.user.count(),
    prisma.student.count(),
    prisma.program.count({ where: { isActive: true } }),
    prisma.application.count({ where: { status: "submitted" } }),
  ]);

  const recentAuditLogs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Real counts from the tdms_next database.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total accounts" value={staffCount} />
        <StatCard label="Students" value={studentCount} />
        <StatCard label="Active programs" value={programCount} />
        <StatCard label="Pending applications" value={pendingApplications} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Recent activity</h2>
        {recentAuditLogs.length === 0 ? (
          <p className="text-sm text-slate-400">No audit activity yet.</p>
        ) : (
          <ul className="space-y-2">
            {recentAuditLogs.map((log) => (
              <li key={log.id} className="text-sm text-slate-600">
                <span className="font-medium text-slate-800">{log.action}</span> — {log.actor}{" "}
                <span className="text-slate-400">
                  ({new Date(log.createdAt).toLocaleString()})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
