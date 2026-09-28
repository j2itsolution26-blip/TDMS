import { requireUser } from '@/server/auth/current-user';
import Navigation, { type NavItem } from '@/components/Navigation';
import {
  programPolicy,
  subjectPolicy,
  studentPolicy,
  applicationPolicy,
  enrollmentPolicy,
  userPolicy,
  adminAccountPolicy,
  systemPolicy,
} from '@/server/auth/policies';
import { dashboardRoleFor } from '@/server/services/dashboard-service';
import { getAdminSetup, getPendingWork, getSearchablePrograms } from '@/server/services/admin-workspace';
import { ROLE_LABELS, type RoleName } from '@/types/domain';

/**
 * Port of layouts/app.blade.php.
 *
 * Wraps every signed-in page: the floating sidebar, the top bar and the
 * content well, on the workspace background (a soft mint glow top-right).
 *
 * requireUser() here is what makes the whole group private — it resolves
 * and validates the session server-side and redirects anonymous visitors,
 * so no page in this segment can accidentally render without a principal.
 *
 * The shell also carries two pieces of live state, both from the
 * admin-workspace service the dashboard reads too, so they always agree:
 * the Admin's setup progress (the sidebar card) and the work waiting on the
 * office (the bell). React's cache makes them one set of queries per request.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // The @can guards from the Blade sidebar, evaluated on the server.
  const items: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', match: ['/dashboard'], icon: 'dashboard', group: 'main' },
  ];

  if (programPolicy.viewAny(user)) {
    items.push({ label: 'Programs', href: '/programs', match: ['/programs', '/curricula'], icon: 'programs', group: 'main' });
  }
  if (subjectPolicy.viewAny(user)) {
    items.push({ label: 'Subjects', href: '/subjects', match: ['/subjects'], icon: 'subjects', group: 'main' });
  }
  if (studentPolicy.viewAny(user)) {
    items.push({ label: 'Students', href: '/students', match: ['/students'], icon: 'students', group: 'people' });
  }
  if (applicationPolicy.viewAny(user)) {
    items.push({ label: 'Applications', href: '/applications', match: ['/applications'], icon: 'applications', group: 'people' });
  }
  if (enrollmentPolicy.viewAny(user)) {
    items.push({ label: 'Enrollments', href: '/enrollments', match: ['/enrollments'], icon: 'enrollments', group: 'people' });
  }
  if (userPolicy.viewAny(user)) {
    items.push({ label: 'Staff', href: '/staff', match: ['/staff'], icon: 'staff', group: 'people' });
  }
  /*
   * Super Admin only, and the page re-checks the same policy. Hiding a nav
   * item is presentation; authorisation happens on the server.
   */
  if (adminAccountPolicy.viewAny(user)) {
    items.push({ label: 'Admin Accounts', href: '/admins', match: ['/admins'], icon: 'admins', group: 'system' });
  }
  if (adminAccountPolicy.manageAccessCodes(user)) {
    items.push({ label: 'Access Codes', href: '/admin-access-codes', match: ['/admin-access-codes'], icon: 'keys', group: 'system' });
  }
  // Super Admin: "Who controls the system?" — security and health, read-only.
  if (systemPolicy.viewAuditLogs(user)) {
    items.push({ label: 'Audit Logs', href: '/audit-logs', match: ['/audit-logs'], icon: 'audit', group: 'system' });
  }
  if (systemPolicy.viewSystemHealth(user)) {
    items.push({ label: 'System Health', href: '/system-health', match: ['/system-health'], icon: 'health', group: 'system' });
  }

  /*
   * The same role the dashboard is chosen by, so the header and the dashboard
   * never disagree about who you are. roles[0] was whichever row the database
   * returned first, which for a two-role account was not necessarily the one
   * that matters.
   */
  const role = dashboardRoleFor(user);
  const roleLabel = role === 'none' ? 'No role' : ROLE_LABELS[role as RoleName];

  const [setup, pending, programs] = await Promise.all([
    getAdminSetup(user),
    getPendingWork(user),
    getSearchablePrograms(user),
  ]);
  const currentStep = setup?.steps.find((s) => s.key === setup.current);

  return (
    <div className="relative min-h-screen bg-tdms-bg font-jakarta text-tdms-ink">
      {/* The soft mint glow in the top-right corner. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-0 top-0 h-[520px] w-[720px]"
        style={{ background: 'radial-gradient(closest-side, rgba(61,220,151,0.16), rgba(61,220,151,0) 100%)', transform: 'translate(30%, -35%)' }}
      />
      <Navigation
        items={items}
        user={{ name: user.name, email: user.email, roleLabel }}
        setup={setup && !setup.complete && currentStep ? { completed: setup.completed, total: setup.total, href: currentStep.href } : null}
        pending={pending.items}
        programs={programs}
        canSearchStudents={studentPolicy.viewAny(user)}
      >
        {children}
      </Navigation>
    </div>
  );
}
