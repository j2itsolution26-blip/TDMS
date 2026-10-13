import { Outlet } from 'react-router-dom';
import Navigation from '@/components/Navigation';
import { usePageData } from '@/lib/page-data';
import type { AppShellData } from '@/server/controllers/pages/app-shell';
import Forbidden from '@/pages/system/Forbidden';
import LoadError from '@/pages/system/LoadError';

/**
 * The signed-in shell: sidebar, header, notifications, around every page.
 *
 * What the sidebar offers is decided on the server (the app-shell loader runs
 * the same policies the pages do); this only draws it. While the shell loads,
 * nothing is drawn — an anonymous visitor is redirected to /login without a
 * flash of the signed-in layout.
 */
export default function AppLayout() {
  const { state, reload } = usePageData<AppShellData>('/app-shell');

  if (state.status === 'loading') return null;
  if (state.status === 'forbidden') return <Forbidden onRetry={reload} />;
  if (state.status === 'not-found' || state.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-tdms-bg px-6">
        <LoadError message={state.status === 'error' ? state.message : 'Not found.'} onRetry={reload} />
      </div>
    );
  }

  const shell = state.data;
  return (
    <div className="relative min-h-screen bg-tdms-bg font-jakarta text-tdms-ink">
      {/* The soft mint glow in the top-right corner. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-0 top-0 h-[520px] w-[720px]"
        style={{ background: 'radial-gradient(closest-side, rgba(61,220,151,0.16), rgba(61,220,151,0) 100%)', transform: 'translate(30%, -35%)' }}
      />
      <Navigation
        items={shell.items}
        user={shell.user}
        setup={shell.setup}
        pending={shell.pending}
        notifications={shell.notifications}
        programs={shell.programs}
        canSearchStudents={shell.canSearchStudents}
      >
        <Outlet />
      </Navigation>
    </div>
  );
}
