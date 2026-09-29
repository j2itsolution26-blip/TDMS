import { requireUser } from '@/server/auth/current-user';
import { dashboardRoleFor, getDashboardView, greeting, formatToday } from '@/server/services/dashboard-service';
import { instructorDashboard } from '@/server/services/teaching/instructor-dashboard';
import InstructorDashboard from '@/components/dashboard/InstructorDashboard';
import {
  DashboardNotice,
  KpiGrid,
  ListPanelView,
  QuickActions,
  StatusPanelView,
} from '@/components/dashboard/DashboardParts';
import DashboardChart from '@/components/dashboard/DashboardChart';
import DirectorDashboard from '@/components/dashboard/DirectorDashboard';
import CoordinatorDashboard from '@/components/dashboard/CoordinatorDashboard';
import SecretaryDashboard from '@/components/dashboard/SecretaryDashboard';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import { greetingForHour, formatLongDate, hourIn } from '@/lib/greeting';
import { institutionTimeZone } from '@/lib/institution-time';

/**
 * /dashboard — one page for every role.
 *
 * The URL and the page are shared; what differs is the view the server builds
 * for the signed-in user (src/server/services/dashboard-service.ts). The layout
 * is the same for everybody — heading, key figures, two operational panels, an
 * analytic, quick actions, recent activity — so moving between roles never
 * means learning a new screen, and there is one renderer to maintain instead
 * of seven.
 *
 * Rendered entirely on the server, per request: the numbers arrive with the
 * page, there is no client-side fetch to fail or to poll, and nothing a role
 * may not see is ever sent to its browser. loading.tsx draws the skeleton
 * while the queries run; error.tsx catches a failure without taking down the
 * rest of the application.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  // The Diploma Instructor's own workspace, from one consolidated service call.
  if (dashboardRoleFor(user) === 'teacher') {
    const now = new Date();
    const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;
    return (
      <InstructorDashboard
        data={await instructorDashboard(user, now)}
        firstName={firstName}
        greeting={greetingForHour(hourIn(now, institutionTimeZone()))}
      />
    );
  }

  const view = await getDashboardView(user);

  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;
  const hasMain = Boolean(view.primary || view.secondary || view.chart);

  // The Admin's workspace. Greeting and date start in the institution's
  // timezone and are switched to the viewer's own in the browser.
  if (view.admin) {
    const now = new Date();
    const tz = institutionTimeZone();
    return (
      <AdminDashboard
        panels={view.admin}
        firstName={firstName}
        greeting={greetingForHour(hourIn(now, tz))}
        date={formatLongDate(now, tz)}
      />
    );
  }

  // The TVET Director, Coordinator and Secretary: one design system, three workspaces.
  if (view.workspace) {
    const now = new Date();
    const tz = institutionTimeZone();
    const common = {
      firstName,
      greeting: greetingForHour(hourIn(now, tz)),
      date: formatLongDate(now, tz),
      description: view.description,
    };
    switch (view.workspace.kind) {
      case 'director':
        return <DirectorDashboard workspace={view.workspace} {...common} />;
      case 'coordinator':
        return <CoordinatorDashboard workspace={view.workspace} {...common} />;
      case 'secretary':
        return <SecretaryDashboard workspace={view.workspace} {...common} />;
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted">
          {greeting()}, {firstName} · {formatToday()}
        </p>
        <h1 className="text-2xl font-semibold leading-tight text-ink sm:text-[28px]">{view.title}</h1>
        <p className="text-sm text-muted">{view.description}</p>
      </header>

      {view.notice && <DashboardNotice title={view.notice.title} body={view.notice.body} />}

      <KpiGrid kpis={view.kpis} />

      {hasMain && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {view.primary && <ListPanelView id="primary" panel={view.primary} />}
          {view.secondary && <ListPanelView id="secondary" panel={view.secondary} />}
          {view.chart && (
            <div className={view.primary && view.secondary ? 'lg:col-span-2 xl:col-span-1' : undefined}>
              <DashboardChart chart={view.chart} />
            </div>
          )}
        </div>
      )}

      {view.statusPanels && view.statusPanels.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {view.statusPanels.map((panel) => (
            <StatusPanelView key={panel.id} panel={panel} />
          ))}
        </div>
      )}

      {/* Without an activity panel, quick actions take the whole row rather than half of it. */}
      <div className={`grid grid-cols-1 gap-6 ${view.activity ? 'xl:grid-cols-2' : ''}`}>
        <QuickActions actions={view.quickActions} wide={!view.activity} />
        {view.activity && <ListPanelView id="activity" panel={view.activity} />}
      </div>
    </div>
  );
}
