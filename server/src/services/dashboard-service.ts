import { prisma } from '@/server/lib/prisma';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import {
  studentPolicy,
  programPolicy,
  subjectPolicy,
  curriculumPolicy,
  userPolicy,
  applicationPolicy,
  studentCredentialPolicy,
  enrollmentPolicy,
  adminAccountPolicy,
  systemPolicy,
  hasRole,
} from '@/server/auth/policies';
import { adminAccessOverview } from '@/server/services/admin-account-service';
import { canSendMail } from '@/server/mail/mailer';
import { googleConfigured } from '@/server/auth/google/oauth';
import { staticCodeConfigured } from '@/server/auth/super-admin-code';
import { vaultConfigured } from '@/server/auth/credential-vault';
import { institutionTimeZone } from '@shared/lib/institution-time';
import { getAdminSetup, getPendingWork } from '@/server/services/admin-workspace';
import { defaultSchoolYear } from '@/server/services/enrollment-service';
import { recentSummaryEvents } from '@/server/services/audit-log-query';
import { coordinatorWorkspace, directorWorkspace, secretaryWorkspace } from '@/server/services/role-workspaces';
import { SECURITY_EVENTS, SYSTEM_ACTIVITY_EVENTS, TONE_BADGE_STATUS } from '@shared/lib/audit-dashboard';
import type { AuthUser } from '@shared/types/domain';
import { ROLE_LABELS, type RoleName } from '@shared/types/domain';
import type {
  AdminQuickAction,
  AdminStat,
  ChartPoint,
  DashboardRole,
  DashboardView,
  Kpi,
  ListItem,
  QuickAction,
  StatusPanel,
  TableRow,
} from '@shared/types/dashboard';

/**
 * Every dashboard, one service.
 *
 * WHAT DECIDES WHAT A ROLE SEES
 *
 * Not the role name. The role picks which LAYOUT of panels to draw — an Admin's
 * operational tasks, a Director's program oversight — but every figure inside
 * is still gated by the same policy that guards the page it summarises. A
 * Coordinator's view never counts students, because studentPolicy does not let
 * a Coordinator see students; a Student's view is built entirely from queries
 * filtered by their own user id. The query for a figure the viewer may not see
 * is not even issued.
 *
 * WHAT IS NOT HERE, AND WHY
 *
 * TDMS holds accounts, the audit trail, programs, curricula, subjects,
 * students, applications, their documents and enrollments. It does not hold
 * classes, schedules, rooms, assignments, quizzes, examinations, attendance,
 * grades, learning materials, requests, appointments, notifications, uptime or
 * storage. None of those appear as numbers here — not as zeros, and not as
 * sample figures. Where a role's dashboard would naturally show them, it says
 * plainly that they are not part of TDMS yet.
 *
 * COST
 *
 * Counts, grouped counts and short `take` lists — never "load everything and
 * count in JavaScript". Independent queries run concurrently.
 */

// --- Unchanged helpers, still used elsewhere ---------------------------------

/** match(true) on the current hour, as the Laravel greeting() did. */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatToday(now = new Date()): string {
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// --- Which dashboard ---------------------------------------------------------

/**
 * Most senior role first. An account holding two roles gets the dashboard of
 * the broader one; its figures are still limited by its policies either way.
 */
const ROLE_ORDER: Exclude<DashboardRole, 'none'>[] = [
  'super_admin',
  'admin',
  'director',
  'coordinator',
  'secretary',
  'teacher',
  'student',
];

export function dashboardRoleFor(user: AuthUser): DashboardRole {
  return ROLE_ORDER.find((role) => hasRole(user, role)) ?? 'none';
}

const DASHBOARD_TITLES: Record<DashboardRole, { title: string; description: string }> = {
  super_admin: {
    title: 'System Overview',
    description: 'Accounts, access, security and the health of the platform.',
  },
  admin: {
    title: 'Admin Dashboard',
    description: 'Daily academic and administrative operations.',
  },
  director: {
    title: 'Director Dashboard',
    description: 'Program leadership, student progression, academic performance, faculty oversight and decisions requiring your attention.',
  },
  coordinator: {
    title: 'Coordinator Dashboard',
    description: 'Manage programs, curricula, subjects and academic coordination.',
  },
  secretary: {
    title: 'Secretary Dashboard',
    description: 'Manage student records, applications, enrollment and program documents.',
  },
  teacher: {
    title: 'Diploma Instructor Dashboard',
    description: 'The programs and subjects you teach within.',
  },
  student: {
    title: 'My Dashboard',
    description: 'Your program, subjects, requirements and enrollment.',
  },
  none: {
    title: 'Dashboard',
    description: 'Your account is signed in but has no role yet.',
  },
};

export async function getDashboardView(user: AuthUser): Promise<DashboardView> {
  const role = dashboardRoleFor(user);
  const head = {
    role,
    roleLabel: role === 'none' ? 'No role' : ROLE_LABELS[role as RoleName],
    ...DASHBOARD_TITLES[role],
  };

  switch (role) {
    case 'super_admin':
      return { ...head, ...(await superAdminView(user)) };
    case 'admin':
      return { ...head, ...(await adminView(user)) };
    case 'director':
    case 'coordinator':
    case 'secretary':
      return { ...head, ...(await workspaceView(user, role)) };
    // The Diploma Instructor has a dashboard of their own (instructor-dashboard.ts),
    // rendered by the page before this view is asked for.
    case 'student':
      return { ...head, ...(await studentView(user)) };
    default:
      return {
        ...head,
        kpis: [],
        primary: null,
        secondary: null,
        chart: null,
        quickActions: [{ label: 'My Profile', description: 'Your name, email and password', href: '/profile', icon: 'profile' }],
        activity: null,
        notice: {
          title: 'No role assigned yet',
          body: 'Your account has been created, but an administrator has not given it a role. Ask them to assign one; this dashboard will then show what is relevant to you.',
        },
      };
  }
}

type Body = Omit<DashboardView, 'role' | 'roleLabel' | 'title' | 'description'>;

/**
 * The Director, Coordinator and Secretary: each its own workspace
 * (role-workspaces.ts), plus the operational activity feed, which is shared.
 * The feed runs alongside the workspace's queries, not after them.
 */
async function workspaceView(user: AuthUser, role: 'director' | 'coordinator' | 'secretary'): Promise<Body> {
  const canStudents = studentPolicy.viewAny(user);
  const canApps = applicationPolicy.viewAny(user);
  const canEnroll = enrollmentPolicy.viewAny(user);
  const canDocs = studentCredentialPolicy.viewAny(user);
  // A Coordinator may not see student records: their feed names nobody and leaves out students and documents.
  const include =
    role === 'coordinator'
      ? { applications: canApps, students: false, enrollments: canEnroll, documents: false }
      : { applications: canApps, students: canStudents, enrollments: canEnroll, documents: canDocs };

  const [operations, workspace] = await Promise.all([
    recentOperations(include, role === 'coordinator' ? false : canStudents, 6),
    role === 'director' ? directorWorkspace(user) : role === 'coordinator' ? coordinatorWorkspace(user) : secretaryWorkspace(user),
  ]);

  workspace.activity = [...workspace.activity, ...operations]
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
    .slice(0, 6);

  return {
    kpis: [],
    primary: null,
    secondary: null,
    chart: null,
    quickActions: operationalActions(user),
    activity: null,
    workspace,
  };
}

// --- Shared queries ------------------------------------------------------------

/** A groupBy on `status`, as { status: count }. */
function byStatus(rows: { status: string; _count: { _all: number } }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.status] = row._count._all;
  return out;
}

async function applicationCounts() {
  const rows = await prisma.application.groupBy({ by: ['status'], _count: { _all: true } });
  const c = byStatus(rows);
  return {
    waiting: (c.submitted ?? 0) + (c.under_review ?? 0),
    returned: c.returned ?? 0,
    approved: c.approved ?? 0,
    total: Object.values(c).reduce((a, b) => a + b, 0),
  };
}

async function enrollmentCounts() {
  const rows = await prisma.enrollment.groupBy({ by: ['status'], _count: { _all: true } });
  const c = byStatus(rows);
  return { pending: c.pending ?? 0, enrolled: c.enrolled ?? 0, dropped: c.dropped ?? 0 };
}

async function documentCounts(monthStart: Date) {
  const [rows, verifiedThisMonth] = await Promise.all([
    prisma.studentCredential.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.studentCredential.count({ where: { status: 'verified', verifiedAt: { gte: monthStart } } }),
  ]);
  const c = byStatus(rows);
  return {
    toReview: (c.submitted ?? 0) + (c.under_review ?? 0),
    verified: c.verified ?? 0,
    verifiedThisMonth,
  };
}

async function studentCounts(weekAgo: Date) {
  const [total, active, graduated, newThisWeek] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { status: 'active' } }),
    prisma.student.count({ where: { status: 'graduated' } }),
    prisma.student.count({ where: { createdAt: { gte: weekAgo } } }),
  ]);
  return { total, active, graduated, newThisWeek };
}

async function programCounts() {
  const [total, active] = await Promise.all([
    prisma.program.count(),
    prisma.program.count({ where: { isActive: true } }),
  ]);
  return { total, active };
}

/**
 * Users holding each role — USERS, not assignment rows.
 *
 * model_has_roles is Spatie's polymorphic table with no foreign key to users,
 * so deleting an account leaves its assignment behind. Counting the rows
 * reported 15 Admins in a database holding 10 users. Joining to users counts
 * the people who actually exist, in one grouped query.
 */
async function usersByRole(): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<{ name: string; n: number }[]>`
    SELECT r.name AS name, count(DISTINCT u.id)::int AS n
    FROM model_has_roles m
    JOIN users u ON u.id = m.model_id
    JOIN roles r ON r.id = m.role_id
    WHERE m.model_type = ${USER_MODEL_TYPE} AND r.guard_name = ${GUARD}
    GROUP BY r.name`;
  return Object.fromEntries(rows.map((r) => [r.name, Number(r.n)]));
}

// --- Time series ----------------------------------------------------------------

// Buckets are drawn in the institution's timezone — see src/lib/institution-time.ts.

function localKey(date: Date, tz: string, granularity: 'day' | 'month'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return granularity === 'month' ? `${get('year')}-${get('month')}` : `${get('year')}-${get('month')}-${get('day')}`;
}

/** The last `n` day or month buckets, oldest first, with display labels. */
function buckets(n: number, granularity: 'day' | 'month', tz: string) {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    if (granularity === 'day') d.setUTCDate(d.getUTCDate() - i);
    else d.setUTCMonth(d.getUTCMonth() - i, 15); // mid-month, clear of any timezone edge
    out.push({
      key: localKey(d, tz, granularity),
      label:
        granularity === 'day'
          ? new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d)
          : new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(d),
    });
  }
  return out;
}

type SeriesTable = 'audit_logs' | 'students' | 'applications' | 'enrollments' | 'credentials_verified';

/**
 * Grouped counts per local day or month, straight from Postgres.
 *
 * The table and column come from a closed list (never from input), so the
 * only interpolated values are the parameters. created_at columns are
 * `timestamp without time zone` holding UTC, hence the double AT TIME ZONE.
 */
async function series(table: SeriesTable, granularity: 'day' | 'month', n: number): Promise<ChartPoint[]> {
  const tz = institutionTimeZone();
  const since = new Date();
  if (granularity === 'day') since.setUTCDate(since.getUTCDate() - (n + 1));
  else since.setUTCMonth(since.getUTCMonth() - (n + 1));
  const fmt = granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';

  let rows: { k: string; n: number }[];
  switch (table) {
    case 'audit_logs':
      rows = await prisma.$queryRaw`
        SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, ${fmt}) AS k, count(*)::int AS n
        FROM audit_logs WHERE created_at >= ${since} GROUP BY 1`;
      break;
    case 'students':
      rows = await prisma.$queryRaw`
        SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, ${fmt}) AS k, count(*)::int AS n
        FROM students WHERE created_at >= ${since} GROUP BY 1`;
      break;
    case 'applications':
      rows = await prisma.$queryRaw`
        SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, ${fmt}) AS k, count(*)::int AS n
        FROM applications WHERE created_at >= ${since} GROUP BY 1`;
      break;
    case 'enrollments':
      rows = await prisma.$queryRaw`
        SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, ${fmt}) AS k, count(*)::int AS n
        FROM enrollments WHERE created_at >= ${since} GROUP BY 1`;
      break;
    case 'credentials_verified':
      rows = await prisma.$queryRaw`
        SELECT to_char((verified_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, ${fmt}) AS k, count(*)::int AS n
        FROM student_credentials WHERE status = 'verified' AND verified_at >= ${since} GROUP BY 1`;
      break;
  }

  const byKey = new Map(rows.map((r) => [r.k, Number(r.n)]));
  return buckets(n, granularity, tz).map((b) => ({ label: b.label, value: byKey.get(b.key) ?? 0 }));
}

// --- Operational activity, from the records themselves -------------------------

/**
 * "Recent activity" for the academic roles.
 *
 * Built from the operational records — applications arriving and being
 * decided, students added, enrollments changing state, documents verified —
 * rather than from the audit log. Two reasons: those services do not write
 * audit events, so the audit log has nothing to say about them; and the audit
 * log is a security record the Super Admin alone may read (systemPolicy). The
 * previous dashboard showed an Admin the raw audit log, access codes and all.
 *
 * `names` is false for a role that may see the activity but not student
 * records, so the line is shown without the person it concerns.
 */
async function recentOperations(
  include: { applications: boolean; students: boolean; enrollments: boolean; documents: boolean },
  names: boolean,
  take = 6,
): Promise<ListItem[]> {
  const items: ListItem[] = [];

  const [apps, decided, students, history, verified] = await Promise.all([
    include.applications
      ? prisma.application.findMany({
          where: { createdAt: { not: null } },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true, firstName: true, lastName: true, createdAt: true, program: { select: { code: true } } },
        })
      : [],
    include.applications
      ? prisma.application.findMany({
          where: { reviewedAt: { not: null } },
          orderBy: { reviewedAt: 'desc' },
          take,
          select: { id: true, status: true, firstName: true, lastName: true, reviewedAt: true, program: { select: { code: true } } },
        })
      : [],
    include.students && names
      ? prisma.student.findMany({
          where: { createdAt: { not: null } },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true, firstName: true, lastName: true, studentNumber: true, createdAt: true },
        })
      : [],
    include.enrollments
      ? prisma.enrollmentStatusHistory.findMany({
          orderBy: { createdAt: 'desc' },
          take,
          select: {
            id: true,
            toStatus: true,
            createdAt: true,
            enrollment: {
              select: {
                schoolYear: true,
                semester: true,
                studentId: true,
                student: { select: { firstName: true, lastName: true } },
              },
            },
          },
        })
      : [],
    include.documents && names
      ? prisma.studentCredential.findMany({
          where: { status: 'verified', verifiedAt: { not: null } },
          orderBy: { verifiedAt: 'desc' },
          take,
          select: {
            id: true,
            verifiedAt: true,
            studentId: true,
            requirement: { select: { name: true } },
            student: { select: { firstName: true, lastName: true } },
          },
        })
      : [],
  ]);

  for (const a of apps) {
    items.push({
      id: `app-new-${a.id}`,
      title: 'New application',
      icon: 'applications',
      subtitle: `${a.firstName} ${a.lastName} · ${a.program.code}`,
      at: a.createdAt!.toISOString(),
      status: { status: 'submitted', label: 'Submitted' },
      href: '/applications',
    });
  }
  for (const a of decided) {
    items.push({
      id: `app-decided-${a.id}`,
      icon: 'applications',
      title: a.status === 'approved' ? 'Application approved' : a.status === 'returned' ? 'Application returned' : 'Application reviewed',
      subtitle: `${a.firstName} ${a.lastName} · ${a.program.code}`,
      at: a.reviewedAt!.toISOString(),
      status: { status: a.status, label: a.status === 'approved' ? 'Approved' : a.status === 'returned' ? 'Returned' : 'Reviewed' },
      href: '/applications',
    });
  }
  for (const s of students) {
    items.push({
      id: `student-${s.id}`,
      title: 'Student record added',
      icon: 'students',
      subtitle: `${s.firstName} ${s.lastName} · ${s.studentNumber}`,
      at: s.createdAt!.toISOString(),
      href: `/students/${s.id}/enrollment`,
    });
  }
  for (const h of history) {
    const term = `${h.enrollment.schoolYear} · Semester ${h.enrollment.semester}`;
    items.push({
      id: `enrollment-${h.id}`,
      title: `Enrollment ${h.toStatus}`,
      icon: 'enrollment',
      subtitle: names ? `${h.enrollment.student.firstName} ${h.enrollment.student.lastName} · ${term}` : term,
      at: h.createdAt.toISOString(),
      status: { status: h.toStatus, label: capitalise(h.toStatus) },
      href: names ? `/students/${h.enrollment.studentId}/enrollment` : undefined,
    });
  }
  for (const c of verified) {
    items.push({
      id: `document-${c.id}`,
      title: 'Document verified',
      icon: 'documents',
      subtitle: `${c.requirement.name} · ${c.student.firstName} ${c.student.lastName}`,
      at: c.verifiedAt!.toISOString(),
      status: { status: 'verified', label: 'Verified' },
      href: `/students/${c.studentId}/enrollment`,
    });
  }

  return items.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, take);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/** A task row: a count that is either waiting or clear, never a bare zero. */
function task(id: string, title: string, count: number, noun: string, href: string, clear: string): ListItem {
  return {
    id,
    title,
    subtitle: count > 0 ? `${plural(count, noun)} waiting` : clear,
    meta: count > 0 ? count.toLocaleString('en-US') : undefined,
    status: count > 0 ? { status: 'pending', label: 'Pending' } : { status: 'completed', label: 'Clear' },
    href,
  };
}

// --- Super Admin ----------------------------------------------------------------

/*
 * System Activity and Security are summaries of the audit trail, built by
 * recentSummaryEvents() from the event lists in src/lib/audit-dashboard.ts.
 * Both are shown to the Super Admin only.
 */

/** The same checks the System Health page runs, reduced to pass/fail. */
async function healthChecks() {
  let database = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = false;
  }
  return [
    { name: 'Database', ok: database },
    { name: 'Email delivery', ok: canSendMail() },
    { name: 'Temporary password vault', ok: vaultConfigured() },
    { name: 'Super Admin security code', ok: staticCodeConfigured() },
    { name: 'Google sign-in', ok: googleConfigured() },
  ];
}

async function superAdminView(user: AuthUser): Promise<Body> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    newThisMonth,
    activeUsers,
    liveSessions,
    programs,
    access,
    checks,
    systemRows,
    securityRows,
    daily,
    roles,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.session.groupBy({ by: ['userId'], where: { expiresAt: { gt: now } } }),
    programPolicy.viewAny(user) ? prisma.program.count() : Promise.resolve(null),
    adminAccountPolicy.manageAccessCodes(user) ? adminAccessOverview() : Promise.resolve(null),
    healthChecks(),
    recentSummaryEvents(SYSTEM_ACTIVITY_EVENTS, 6),
    recentSummaryEvents(SECURITY_EVENTS, 6),
    series('audit_logs', 'day', 7),
    usersByRole(),
  ]);

  const inactive = totalUsers - activeUsers;
  const passing = checks.filter((c) => c.ok).length;
  const failing = checks.filter((c) => !c.ok);

  const kpis: Kpi[] = [
    {
      key: 'users',
      label: 'Total Users',
      value: totalUsers,
      hint: newThisMonth > 0 ? `+${newThisMonth} this month` : 'None added this month',
      tone: newThisMonth > 0 ? 'positive' : 'neutral',
      icon: 'users',
    },
    {
      key: 'active',
      label: 'Active Users',
      value: activeUsers,
      hint: inactive > 0 ? `${inactive} not active` : 'Every account is active',
      tone: inactive > 0 ? 'attention' : 'positive',
      icon: 'active',
    },
    {
      key: 'sessions',
      label: 'Signed In Now',
      value: liveSessions.length,
      hint: 'With a live session',
      icon: 'session',
    },
  ];

  if (programs !== null) {
    kpis.push({
      key: 'programs',
      label: 'Programs',
      value: programs,
      hint: programs === 0 ? 'None created yet' : 'Academic programs',
      icon: 'programs',
    });
  }
  if (access) {
    kpis.push({
      key: 'admins',
      label: 'Admin Access',
      value: access.activeAdmins,
      hint: `${plural(access.activeCodes, 'live access code')}`,
      icon: 'keys',
      href: '/admin-access-codes',
    });
  }
  kpis.push({
    key: 'health',
    label: 'System Health',
    value: `${passing}/${checks.length}`,
    // The count here; the names are on the System Health page it links to.
    hint:
      failing.length === 0
        ? 'All checks passing'
        : `${plural(failing.length, 'check')} need${failing.length === 1 ? 's' : ''} attention`,
    tone: failing.length === 0 ? 'positive' : 'attention',
    icon: 'health',
    href: systemPolicy.viewSystemHealth(user) ? '/system-health' : undefined,
  });

  const roleOrder = ['super_admin', 'admin', 'director', 'coordinator', 'secretary', 'teacher', 'student'];

  const ok = (yes: boolean, good: string, bad: string) =>
    yes ? { status: 'active', label: good } : { status: 'pending', label: bad };

  /*
   * Admin Access: where Admin sign-in credentials stand, and the way in to
   * manage them. Numbers from adminAccessOverview(); the security code only as
   * configured / not configured — never a value.
   */
  const statusPanels: StatusPanel[] = [];
  if (access) {
    statusPanels.push({
      id: 'admin-access',
      title: 'Admin Access Codes',
      description: 'One-time codes Admins use to finish their first sign-in',
      rows: [
        { label: 'Active Admins', value: access.activeAdmins.toLocaleString('en-US'), href: '/admins' },
        { label: 'Active access codes', value: access.activeCodes.toLocaleString('en-US') },
        { label: 'Expired codes', value: access.expiredCodes.toLocaleString('en-US') },
        { label: 'Used codes', value: access.usedCodes.toLocaleString('en-US') },
        {
          label: 'Super Admin security code',
          status: ok(access.securityCodeConfigured, 'Configured', 'Not configured'),
        },
        {
          label: 'Temporary password reveal',
          status: ok(access.revealConfigured, 'Configured', 'Not configured'),
        },
      ],
      actions: [
        { label: 'Generate Access Code', href: '/admin-access-codes?generate=new', primary: true },
        { label: 'Manage Access Codes', href: '/admin-access-codes' },
        { label: 'Admin Accounts', href: '/admins' },
      ],
    });
  }

  // System Status: the health checks by name, not just a count.
  statusPanels.push({
    id: 'system-status',
    title: 'System Status',
    description: 'Configuration and service checks',
    rows: checks.map((c) => ({
      label: c.name,
      status: ok(c.ok, c.name === 'Database' ? 'Online' : 'OK', 'Needs attention'),
    })),
    actions: systemPolicy.viewSystemHealth(user)
      ? [{ label: 'View System Health', href: '/system-health' }]
      : [],
  });

  return {
    statusPanels,
    kpis,
    /*
     * A summary: what happened, to whom, when — and for Security, whether it
     * needs attention. Codes, addresses, ids, IPs and stored details stay on
     * the Audit Logs page, which "View all" opens.
     */
    primary: {
      title: 'System Activity',
      description: 'Important account, access and administrative activity',
      viewAll: { label: 'View all', href: '/audit-logs' },
      items: systemRows.map((e) => ({ id: e.id, title: e.label, subtitle: e.person, at: e.at })),
      empty: { title: 'No recent activity', description: 'Account and access changes will appear here as they happen.' },
    },
    secondary: {
      title: 'Security',
      description: 'Security events requiring attention',
      viewAll: { label: 'View all', href: '/audit-logs' },
      items: securityRows.map((e) => ({
        id: e.id,
        title: e.label,
        subtitle: e.person,
        at: e.at,
        status: e.status ? { status: TONE_BADGE_STATUS[e.status.tone], label: e.status.label } : undefined,
      })),
      empty: { title: 'No recent activity', description: 'Sign-ins and credential events will appear here as they happen.' },
    },
    chart: {
      title: 'Audit Activity',
      description: 'Events recorded per day, last 7 days',
      kind: 'bars',
      points: daily,
      unit: 'events',
      empty: { title: 'Nothing recorded this week', description: 'Audited actions will be charted here as they happen.' },
    },
    quickActions: [
      ...(adminAccountPolicy.viewAny(user)
        ? [{ label: 'Admin Accounts', description: 'Create, reset and suspend Admins', href: '/admins', icon: 'shield' as const }]
        : []),
      ...(adminAccountPolicy.manageAccessCodes(user)
        ? [{ label: 'Access Codes', description: 'Issue and revoke sign-in codes', href: '/admin-access-codes', icon: 'keys' as const }]
        : []),
      ...(systemPolicy.viewAuditLogs(user)
        ? [{ label: 'Audit Logs', description: 'Every recorded security event', href: '/audit-logs', icon: 'audit' as const }]
        : []),
      ...(systemPolicy.viewSystemHealth(user)
        ? [{ label: 'System Health', description: 'Configuration and service checks', href: '/system-health', icon: 'health' as const }]
        : []),
    ],
    activity: {
      title: 'Users by Role',
      description: 'Accounts holding each role',
      items: roleOrder
        .filter((r) => (roles[r] ?? 0) > 0)
        .map((r) => ({
          id: r,
          title: ROLE_LABELS[r as RoleName],
          meta: plural(roles[r]!, 'user'),
        })),
      empty: { title: 'No roles assigned', description: 'Roles appear here once accounts hold them.' },
    },
  };
}

// --- Admin ------------------------------------------------------------------------

async function adminView(user: AuthUser): Promise<Body> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const canStudents = studentPolicy.viewAny(user);
  const canStaff = userPolicy.viewAny(user);
  const canPrograms = programPolicy.viewAny(user);
  const canApps = applicationPolicy.viewAny(user);
  const canDocs = studentCredentialPolicy.viewAny(user);
  const canEnroll = enrollmentPolicy.viewAny(user);

  const [
    setup, pending, students, newStudents, teachers, programs, apps, enrollTotal, enroll,
    studentTrend, appTrend, enrollTrend, term, activity,
  ] = await Promise.all([
    getAdminSetup(user),
    getPendingWork(user),
    canStudents ? studentCounts(weekAgo) : null,
    canStudents ? prisma.student.count({ where: { createdAt: { gte: monthStart } } }) : 0,
    canStaff ? teacherCounts(monthStart) : null,
    canPrograms ? programCounts() : null,
    canApps ? applicationCounts() : null,
    canEnroll ? prisma.enrollment.count() : 0,
    canEnroll ? enrollmentCounts() : null,
    canStudents ? series('students', 'month', 6) : null,
    canApps ? series('applications', 'month', 6) : null,
    canEnroll ? series('enrollments', 'month', 6) : null,
    currentTerm(canEnroll),
    recentOperations(
      { applications: canApps, students: canStudents, enrollments: canEnroll, documents: canDocs },
      canStudents,
      5,
    ),
  ]);

  const hasProgram = (programs?.total ?? 0) > 0;
  const trend = (points: ChartPoint[] | null) =>
    points && points.some((p) => p.value > 0) ? points.map((p) => p.value) : undefined;

  const stats: AdminStat[] = [];
  if (students) {
    const canAdd = hasProgram && studentPolicy.create(user);
    stats.push({
      key: 'students', label: 'Students', value: students.total,
      tag: newStudents > 0 ? `+${newStudents.toLocaleString('en-US')} this month` : '— this month',
      link: canAdd ? { label: 'Add student', href: '/students?new=1' } : { label: 'View students', href: '/students' },
      trend: trend(studentTrend),
    });
  }
  if (teachers) {
    stats.push({
      key: 'teachers', label: 'Diploma Instructors', value: teachers.total,
      tag: teachers.newThisMonth > 0 ? `+${teachers.newThisMonth.toLocaleString('en-US')} new` : 'No new',
      link: { label: 'View staff', href: '/staff' },
    });
  }
  if (programs) {
    stats.push({
      key: 'programs', label: 'Programs', value: programs.total,
      tag: setup?.current === 'program' ? 'Next step' : `${programs.active.toLocaleString('en-US')} active`,
      link: programPolicy.create(user)
        ? { label: 'Create program', href: '/programs?new=1' }
        : { label: 'View all', href: '/programs' },
    });
  }
  if (apps) {
    stats.push({
      key: 'applications', label: 'Applications', value: apps.total,
      // "Closed" until the first application is recorded — the last setup step.
      tag: apps.total === 0 ? 'Closed' : `${apps.waiting.toLocaleString('en-US')} pending`,
      link: { label: 'View all', href: '/applications' },
      trend: trend(appTrend),
    });
  }
  if (enroll) {
    stats.push({
      key: 'enrollments', label: 'Enrollments', value: enrollTotal,
      tag: `${enroll.pending.toLocaleString('en-US')} pending`,
      link: { label: 'View all', href: '/enrollments' },
      trend: trend(enrollTrend),
    });
  }

  const quickActions: AdminQuickAction[] = [];
  if (programPolicy.create(user)) {
    quickActions.push({ key: 'program', label: 'New program', caption: 'Set up a diploma program', href: '/programs?new=1' });
  }
  if (subjectPolicy.create(user)) {
    quickActions.push({ key: 'subject', label: 'New subject', caption: 'Add to the catalogue', href: '/subjects?new=1' });
  }
  if (userPolicy.create(user)) {
    quickActions.push({ key: 'staff', label: 'Invite staff', caption: 'Create a staff account', href: '/staff?new=1' });
  }
  if (studentPolicy.create(user)) {
    quickActions.push(
      hasProgram
        ? { key: 'student', label: 'Add student', caption: 'Create a student record', href: '/students?new=1' }
        : { key: 'student', label: 'Add student', caption: 'Needs a program first', href: '/programs?new=1', disabled: true },
    );
  }

  return {
    // The shared fields stay valid so nothing reading a DashboardView breaks;
    // the page draws the Admin workspace from `admin`.
    kpis: [],
    primary: null,
    secondary: null,
    chart: null,
    quickActions: operationalActions(user),
    activity: null,
    admin: { setup, stats, pending, activity, quickActions, newStudents: studentTrend, term },
  };
}

/** Teacher accounts, and how many were created this month. */
async function teacherCounts(monthStart: Date) {
  const rows = await prisma.$queryRaw<{ total: number; recent: number }[]>`
    SELECT count(DISTINCT u.id)::int AS total,
           count(DISTINCT u.id) FILTER (WHERE u.created_at >= ${monthStart})::int AS recent
    FROM model_has_roles m
    JOIN users u ON u.id = m.model_id
    JOIN roles r ON r.id = m.role_id
    WHERE m.model_type = ${USER_MODEL_TYPE} AND r.guard_name = ${GUARD} AND r.name = 'teacher'`;
  return { total: Number(rows[0]?.total ?? 0), newThisMonth: Number(rows[0]?.recent ?? 0) };
}

/**
 * The current term, for the hero. The school year follows TDMS's own rule
 * (it rolls over in June — defaultSchoolYear); the semester is named only
 * when an enrollment for this school year says which one is running. TDMS has
 * no academic calendar, so it is never guessed from the month.
 */
async function currentTerm(canEnroll: boolean): Promise<string> {
  const schoolYear = defaultSchoolYear();
  const label = `SY ${schoolYear.replace('-', '–')}`;
  if (!canEnroll) return label;
  const latest = await prisma.enrollment.findFirst({
    where: { schoolYear },
    orderBy: { semester: 'desc' },
    select: { semester: true },
  });
  if (!latest) return label;
  const n = latest.semester;
  const ordinal = n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
  return `${ordinal} Semester, ${label}`;
}

/** The operational screens this user may open, in a stable order. */
function operationalActions(user: AuthUser): QuickAction[] {
  const actions: QuickAction[] = [];
  if (studentPolicy.viewAny(user)) actions.push({ label: 'Students', description: 'Records, documents and enrollment', href: '/students', icon: 'students' });
  if (applicationPolicy.viewAny(user)) actions.push({ label: 'Applications', description: 'Review and decide', href: '/applications', icon: 'applications' });
  if (programPolicy.viewAny(user)) actions.push({ label: 'Programs', description: 'Programs and curricula', href: '/programs', icon: 'programs' });
  if (subjectPolicy.viewAny(user)) actions.push({ label: 'Subjects', description: 'The subject catalogue', href: '/subjects', icon: 'subjects' });
  if (userPolicy.viewAny(user)) actions.push({ label: 'Staff', description: 'Staff accounts and roles', href: '/staff', icon: 'staff' });
  actions.push({ label: 'My Profile', description: 'Your name, email and password', href: '/profile', icon: 'profile' });
  return actions;
}

// --- Student -------------------------------------------------------------------------

/**
 * A student's own dashboard. Every query below is filtered by THIS user's
 * student record, found through their own user id — there is no input from
 * the request that could point it at somebody else.
 */
async function studentView(user: AuthUser): Promise<Body> {
  const student = await prisma.student.findFirst({
    where: { userId: BigInt(user.id) },
    select: {
      id: true,
      yearLevel: true,
      status: true,
      programId: true,
      curriculumId: true,
      program: { select: { code: true, name: true } },
      curriculum: { select: { versionLabel: true } },
    },
  });

  const profile: QuickAction = { label: 'My Profile', description: 'Your name, email and password', href: '/profile', icon: 'profile' };

  if (!student) {
    return {
      kpis: [],
      primary: null,
      secondary: null,
      chart: null,
      quickActions: [profile],
      activity: null,
      notice: {
        title: 'Your account is not linked to a student record yet',
        body: 'Once the registrar links your account to your student record, your program, subjects, requirements and enrollment will appear here. If you expected to see them already, contact the TVET office.',
      },
    };
  }

  const [subjects, requirements, mine, enrollments, badgeCount, openAssessments, releasedGrades] = await Promise.all([
    prisma.curriculumSubject.findMany({
      where: { curriculumId: student.curriculumId, yearLevel: student.yearLevel },
      orderBy: [{ semester: 'asc' }, { id: 'asc' }],
      select: { id: true, semester: true, units: true, subject: { select: { code: true, title: true } } },
    }),
    prisma.credentialRequirement.findMany({
      where: { isActive: true, OR: [{ programId: null }, { programId: student.programId }] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isRequired: true },
    }),
    prisma.studentCredential.findMany({
      where: { studentId: student.id },
      select: { credentialRequirementId: true, status: true },
    }),
    prisma.enrollment.findMany({
      where: { studentId: student.id },
      orderBy: [{ schoolYear: 'desc' }, { semester: 'desc' }],
      take: 6,
      select: { id: true, schoolYear: true, semester: true, yearLevel: true, status: true },
    }),
    prisma.studentBadge.count({ where: { studentId: student.id } }),
    // Published assessments in the student's sections whose results are not yet released.
    prisma.assessment.count({
      where: { published: true, scoreStatus: 'DRAFT', class: { section: { students: { some: { studentId: student.id } } } } },
    }),
    prisma.classGrade.count({ where: { studentId: student.id, class: { gradeStatus: 'RELEASED' } } }),
  ]);

  const statusOf = new Map(mine.map((c) => [c.credentialRequirementId.toString(), c.status]));
  const required = requirements.filter((r) => r.isRequired);
  const verified = required.filter((r) => statusOf.get(r.id.toString()) === 'verified').length;
  const units = subjects.reduce((sum, s) => sum + s.units.toNumber(), 0);

  const bySemester = new Map<number, number>();
  for (const s of subjects) bySemester.set(s.semester, (bySemester.get(s.semester) ?? 0) + s.units.toNumber());

  const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
  const current = enrollments[0];

  const kpis: Kpi[] = [
    { key: 'program', label: 'Program', value: student.program.code, icon: 'programs', hint: student.program.name },
    { key: 'year', label: 'Year Level', value: `${ordinal(student.yearLevel)} Year`, icon: 'calendar', hint: capitalise(student.status) },
    { key: 'subjects', label: 'Subjects', value: subjects.length, icon: 'subjects', hint: subjects.length === 0 ? 'None mapped for your year yet' : 'This year level' },
    { key: 'units', label: 'Units', value: units, icon: 'units', hint: units === 0 ? 'No subjects yet' : 'This year level' },
    {
      key: 'documents',
      label: 'Requirements',
      value: required.length === 0 ? '—' : `${verified}/${required.length}`,
      icon: 'documents',
      hint: required.length === 0 ? 'None required of you' : verified === required.length ? 'All verified' : `${required.length - verified} still needed`,
      tone: required.length > 0 && verified < required.length ? 'attention' : 'positive',
    },
    { key: 'assessments', label: 'Quizzes & Exams', value: openAssessments, icon: 'calendar', href: '/my/assessments', hint: openAssessments === 0 ? 'Nothing scheduled' : 'Scheduled or open' },
    { key: 'badges', label: 'Badges', value: badgeCount, icon: 'active', href: '/my/badges', hint: badgeCount === 0 ? 'None yet' : 'From your instructors' },
  ];

  const docStatus = (status: string | undefined) => {
    switch (status) {
      case 'verified': return { status: 'verified', label: 'Verified' };
      case 'submitted': return { status: 'submitted', label: 'Submitted' };
      case 'under_review': return { status: 'under_review', label: 'Under review' };
      case 'rejected': return { status: 'rejected', label: 'Rejected' };
      case 'expired': return { status: 'expired', label: 'Expired' };
      default: return { status: 'missing', label: 'Not submitted' };
    }
  };

  return {
    kpis,
    primary: {
      title: 'My Subjects',
      description: `${ordinal(student.yearLevel)} year · ${student.curriculum.versionLabel}`,
      items: subjects.map((s) => ({
        id: s.id.toString(),
        title: s.subject.title,
        subtitle: s.subject.code,
        meta: `Sem ${s.semester} · ${s.units.toNumber()} units`,
      })),
      empty: { title: 'No subjects yet', description: 'Subjects for your year level will appear once your curriculum is set up.' },
    },
    secondary: {
      title: 'My Requirements',
      description: 'Documents the TVET office needs from you',
      items: requirements.map((r) => ({
        id: r.id.toString(),
        title: r.name,
        subtitle: r.isRequired ? 'Required' : 'Optional',
        status: docStatus(statusOf.get(r.id.toString())),
      })),
      empty: { title: 'No requirements', description: 'There are no documents you need to submit.' },
    },
    chart: {
      title: 'Units by Semester',
      description: `Your ${ordinal(student.yearLevel)}-year load`,
      kind: 'bars',
      points: [...bySemester.entries()].sort((a, b) => a[0] - b[0]).map(([sem, u]) => ({ label: `Sem ${sem}`, value: u })),
      unit: 'units',
      empty: { title: 'No subjects yet', description: 'Your load per semester will appear once subjects are mapped.' },
    },
    quickActions: [
      { label: 'My QR Code', description: 'Show it to record attendance', href: '/my/qr', icon: 'keys' },
      { label: 'My Attendance', description: 'Your class attendance history', href: '/my/attendance', icon: 'calendar' },
      { label: 'Quizzes & Exams', description: 'Schedules, online tests and results', href: '/my/assessments', icon: 'documents' },
      { label: 'My Grades', description: releasedGrades ? `${releasedGrades} released` : 'Released final grades', href: '/my/grades', icon: 'subjects' },
      profile,
    ],
    activity: {
      title: 'My Enrollment',
      description: current ? `Latest: ${current.schoolYear}, semester ${current.semester}` : 'Your enrollment history',
      items: enrollments.map((e) => ({
        id: e.id.toString(),
        title: `${e.schoolYear} · Semester ${e.semester}`,
        subtitle: `${ordinal(e.yearLevel)} year`,
        status: { status: e.status, label: capitalise(e.status) },
      })),
      empty: { title: 'Not enrolled in a term yet', description: 'Your enrollments will be listed here once the office records them.' },
    },
  };
}

