import { requireUser } from '@/server/auth/current-user';
import Navigation, { type NavGroup, type NavItem } from '@/components/Navigation';
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
/**
 * The TVET roles' own sidebars. Each is an ARRANGEMENT of the links the
 * policies above already allowed — it can regroup or leave a link out, never
 * add one — so a link a role may not open cannot appear, and each page still
 * re-checks its own policy on the server. Modules TDMS does not have yet
 * (grades, attendance, competencies, assessment, reports) are not listed:
 * a link to nothing is worse than no link.
 *
 * Curricula live inside each program (/programs/[id]), and "Teachers" is the
 * Admin's Staff screen, which these roles may not open — so neither has an
 * entry of its own. A Coordinator may not see student records, so the
 * Students link is absent for them by policy.
 */
const ROLE_SIDEBARS: Record<'director' | 'coordinator' | 'secretary', [NavGroup, string[]][]> = {
  director: [
    ['main', ['/dashboard']],
    ['academic', ['/programs', '/subjects']],
    ['people', ['/students']],
    ['admissions', ['/applications', '/enrollments']],
    ['account', ['/profile']],
  ],
  coordinator: [
    ['main', ['/dashboard']],
    ['academic', ['/programs', '/subjects']],
    ['people', ['/students']],
    ['admissions', ['/applications', '/enrollments']],
    ['account', ['/profile']],
  ],
  secretary: [
    ['main', ['/dashboard']],
    ['records', ['/students']],
    ['admissions', ['/applications', '/enrollments']],
    ['programs', ['/programs']],
    ['account', ['/profile']],
  ],
};

const PROFILE_ITEM: NavItem = { label: 'My Profile', href: '/profile', match: ['/profile'], icon: 'profile', group: 'account' };

function arrange(allowed: NavItem[], layout: [NavGroup, string[]][]): NavItem[] {
  const byHref = new Map([...allowed, PROFILE_ITEM].map((i) => [i.href, i]));
  return layout.flatMap(([group, hrefs]) =>
    hrefs.flatMap((href) => {
      const item = byHref.get(href);
      return item ? [{ ...item, group }] : [];
    }),
  );
}

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
  const nav = ROLE_SIDEBARS[role as keyof typeof ROLE_SIDEBARS] ? arrange(items, ROLE_SIDEBARS[role as keyof typeof ROLE_SIDEBARS]) : items;

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
        items={nav}
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
