import InstructorDashboard from '@/components/dashboard/InstructorDashboard';
import { DashboardNotice, KpiGrid, ListPanelView, QuickActions, StatusPanelView } from '@/components/dashboard/DashboardParts';
import DashboardChart from '@/components/dashboard/DashboardChart';
import DirectorDashboard from '@/components/dashboard/DirectorDashboard';
import CoordinatorDashboard from '@/components/dashboard/CoordinatorDashboard';
import SecretaryDashboard from '@/components/dashboard/SecretaryDashboard';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import { Page } from '@/lib/page-data';
import type { loadDashboard } from '@/server/controllers/pages/app/dashboard';
import DashboardLoading from './dashboard/DashboardLoading';
import DashboardError from './dashboard/DashboardError';

type Data = Awaited<ReturnType<typeof loadDashboard>>;

function View(d: Data) {
  switch (d.kind) {
    case 'teacher':
      return <InstructorDashboard data={d.data} firstName={d.firstName} greeting={d.greeting} />;
    case 'admin':
      return <AdminDashboard panels={d.panels} firstName={d.firstName} greeting={d.greeting} date={d.date} />;
    case 'workspace':
      switch (d.workspace.kind) {
        case 'director':
          return <DirectorDashboard workspace={d.workspace} {...d.common} />;
        case 'coordinator':
          return <CoordinatorDashboard workspace={d.workspace} {...d.common} />;
        case 'secretary':
          return <SecretaryDashboard workspace={d.workspace} {...d.common} />;
      }
      return null;
    case 'generic': {
      const { view, firstName, hasMain } = d;
      return (
        <div className="space-y-6">
          <header className="flex flex-col gap-1">
            <p className="text-sm text-muted">
              {d.greeting}, {firstName} · {d.today}
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
  }
}

/** /dashboard — every role's workspace. */
export default function DashboardPage() {
  return (
    <Page<Data>
      endpoint="/dashboard"
      loading={<DashboardLoading />}
      error={(retry) => <DashboardError onRetry={retry} />}
      render={(d) => <View {...d} />}
    />
  );
}
