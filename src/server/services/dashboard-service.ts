import 'server-only';
import { prisma } from '@/lib/prisma';
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
import { humanizeAction } from '@/lib/dates';
import { institutionTimeZone } from '@/lib/institution-time';
import type { AuthUser } from '@/types/domain';
import { ROLE_LABELS, type RoleName } from '@/types/domain';
import type {
  ChartPoint,
  DashboardRole,
  DashboardView,
  Kpi,
  ListItem,
  QuickAction,
  StatusPanel,
  TableRow,
} from '@/types/dashboard';

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
    description: 'Program leadership, oversight and academic performance.',
  },
  coordinator: {
    title: 'Coordinator Dashboard',
    description: 'Programs, curricula and the subjects that make them up.',
  },
  secretary: {
    title: 'Secretary Dashboard',
    description: 'Applications, documents and enrollment paperwork.',
  },
  teacher: {
    title: 'Teacher Dashboard',
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
      return { ...head, ...(await directorView(user)) };
    case 'coordinator':
      return { ...head, ...(await coordinatorView(user)) };
    case 'secretary':
      return { ...head, ...(await secretaryView(user)) };
    case 'teacher':
      return { ...head, ...(await teacherView(user)) };
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

/** Ids of users holding a role — for figures that must also filter by account state. */
async function userIdsWithRole(roleName: string): Promise<bigint[]> {
  const role = await prisma.role.findFirst({ where: { name: roleName, guardName: GUARD }, select: { id: true } });
  if (!role) return [];
  const rows = await prisma.modelHasRole.findMany({
    where: { roleId: role.id, modelType: USER_MODEL_TYPE },
    select: { modelId: true },
  });
  return rows.map((r) => r.modelId);
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

/**
 * Audit actions that are about AUTHENTICATION — who got in, who did not. The
 * rest of the audit trail is account and access administration. Both halves
 * are shown to the Super Admin only.
 */
const SECURITY_ACTIONS = [
  'ADMIN_LOGIN_SUCCESS',
  'ADMIN_LOGIN_FAILED',
  'ADMIN_PASSWORD_ACCEPTED',
  'ACCESS_CODE_USED',
  'ACCESS_CODE_EXPIRED',
  'SUPER_ADMIN_SECURITY_CODE_REJECTED',
  'SUPER_ADMIN_VERIFICATION_ATTEMPTS_EXCEEDED',
  'ACCOUNT_PASSWORD_RESET_COMPLETED',
  'ADMIN_TEMP_PASSWORD_CHANGED',
  // The same event for a staff account.
  'TEMP_PASSWORD_CHANGED',
  // Earlier names for the same event, still present in older rows.
  'ADMIN_TEMPORARY_PASSWORD_CHANGED',
  'TEMP_PASSWORD_USED',
];

function securityStatus(action: string) {
  if (/FAILED|REJECTED|EXCEEDED/.test(action)) return { status: 'failed', label: 'Failed' };
  if (/EXPIRED/.test(action)) return { status: 'expired', label: 'Expired' };
  if (/ACCEPTED/.test(action)) return { status: 'pending', label: 'Step 1 of 2' };
  return { status: 'completed', label: 'Success' };
}

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
    prisma.auditLog.findMany({
      where: { action: { notIn: SECURITY_ACTIONS } },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, action: true, target: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { action: { in: SECURITY_ACTIONS } },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, action: true, target: true, ipAddress: true, createdAt: true },
    }),
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
    primary: {
      title: 'System Activity',
      description: 'Accounts, access codes and administration',
      viewAll: { label: 'Audit logs', href: '/audit-logs' },
      items: systemRows.map((r) => ({
        id: r.id.toString(),
        title: humanizeAction(r.action),
        subtitle: r.target,
        at: r.createdAt.toISOString(),
      })),
      empty: { title: 'No system activity yet', description: 'Account and access changes will be listed here as they happen.' },
    },
    secondary: {
      title: 'Security Log',
      description: 'Sign-ins, access codes and verification',
      viewAll: { label: 'Audit logs', href: '/audit-logs' },
      items: securityRows.map((r) => ({
        id: r.id.toString(),
        title: humanizeAction(r.action),
        subtitle: r.ipAddress ? `${r.target} · ${r.ipAddress}` : r.target,
        at: r.createdAt.toISOString(),
        status: securityStatus(r.action),
      })),
      empty: { title: 'No sign-in events yet', description: 'Administrator sign-ins and access-code use will appear here.' },
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

  const [students, teacherIds, staffIds, programs, apps, enroll, docs, monthly, activity] = await Promise.all([
    canStudents ? studentCounts(weekAgo) : null,
    canStaff ? userIdsWithRole('teacher') : null,
    canStaff ? staffAwaitingSetup() : null,
    canPrograms ? programCounts() : null,
    canApps ? applicationCounts() : null,
    canEnroll ? enrollmentCounts() : null,
    canDocs ? documentCounts(monthStart) : null,
    canStudents ? series('students', 'month', 6) : null,
    recentOperations(
      { applications: canApps, students: canStudents, enrollments: canEnroll, documents: canDocs },
      canStudents,
    ),
  ]);

  const teachers = teacherIds ? await prisma.user.count({ where: { id: { in: teacherIds } } }) : null;

  const kpis: Kpi[] = [];
  if (students) {
    kpis.push({
      key: 'students', label: 'Students', value: students.total, icon: 'students', href: '/students',
      hint: students.total === 0 ? 'No student records yet' : students.newThisWeek > 0 ? `+${students.newThisWeek} this week` : `${students.active} active`,
      tone: students.newThisWeek > 0 ? 'positive' : 'neutral',
    });
  }
  if (teachers !== null) {
    kpis.push({
      key: 'teachers', label: 'Teachers', value: teachers, icon: 'staff', href: '/staff',
      hint: teachers === 0 ? 'No teacher accounts yet' : 'Teacher accounts',
    });
  }
  if (programs) {
    kpis.push({
      key: 'programs', label: 'Programs', value: programs.total, icon: 'programs', href: '/programs',
      hint: programs.total === 0 ? 'None created yet' : `${programs.active} active`,
    });
  }
  if (apps) {
    kpis.push({
      key: 'applications', label: 'Applications', value: apps.waiting, icon: 'applications', href: '/applications',
      hint: apps.waiting > 0 ? 'Awaiting a decision' : 'None waiting',
      tone: apps.waiting > 0 ? 'attention' : 'neutral',
    });
  }
  if (enroll) {
    kpis.push({
      key: 'enrollments', label: 'Enrollments', value: enroll.pending, icon: 'enrollment',
      hint: enroll.pending > 0 ? 'Awaiting approval' : `${enroll.enrolled} enrolled`,
      tone: enroll.pending > 0 ? 'attention' : 'neutral',
    });
  }

  const tasks: ListItem[] = [];
  if (apps) {
    tasks.push(task('t-apps', 'Application review', apps.waiting, 'application', '/applications', 'No applications waiting'));
    tasks.push(task('t-returned', 'Returned applications', apps.returned, 'application', '/applications', 'None returned for correction'));
  }
  if (docs) tasks.push(task('t-docs', 'Documents to verify', docs.toReview, 'document', '/students', 'No documents waiting'));
  if (enroll) tasks.push(task('t-enroll', 'Enrollments to approve', enroll.pending, 'enrollment', '/students', 'No enrollments waiting'));
  if (staffIds !== null) {
    tasks.push(task('t-staff', 'Staff accounts not yet set up', staffIds, 'account', '/staff', 'Every staff account is set up'));
  }

  return {
    kpis,
    primary: {
      title: 'Operational Tasks',
      description: 'What is waiting on the office',
      items: tasks,
      empty: { title: 'Nothing to do', description: 'Tasks appear here when records need attention.' },
    },
    secondary: {
      title: 'Recent Activity',
      description: 'Applications, students, enrollments and documents',
      items: activity,
      empty: {
        title: 'No activity yet',
        description: 'New applications, student records and enrollment changes will appear here.',
        ...(canStudents ? { action: { label: 'Add a student', href: '/students' } } : {}),
      },
    },
    chart: monthly
      ? {
          title: 'New Students',
          description: 'Student records added per month, last 6 months',
          kind: 'bars',
          points: monthly,
          unit: 'students',
          empty: { title: 'No student records yet', description: 'Monthly additions will be charted once students are recorded.' },
        }
      : null,
    quickActions: operationalActions(user),
    activity: null,
  };
}

/** Staff accounts still on a temporary password — issued but never used. */
async function staffAwaitingSetup(): Promise<number> {
  const staffRoles = await prisma.role.findMany({
    where: { guardName: GUARD, name: { notIn: ['student', 'super_admin', 'admin'] } },
    select: { id: true },
  });
  if (staffRoles.length === 0) return 0;
  const rows = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, roleId: { in: staffRoles.map((r) => r.id) } },
    select: { modelId: true },
  });
  if (rows.length === 0) return 0;
  return prisma.user.count({
    where: { id: { in: [...new Set(rows.map((r) => r.modelId))] }, mustChangePassword: true },
  });
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

// --- Director ---------------------------------------------------------------------

async function directorView(user: AuthUser): Promise<Body> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const canPrograms = programPolicy.viewAny(user);
  const canStudents = studentPolicy.viewAny(user);
  const canApps = applicationPolicy.viewAny(user);
  const canDocs = studentCredentialPolicy.viewAny(user);
  const canEnroll = enrollmentPolicy.viewAny(user);

  const [programs, students, apps, enroll, docs, perProgram, trend, latestApps, activity] = await Promise.all([
    canPrograms ? programCounts() : null,
    canStudents ? studentCounts(weekAgo) : null,
    canApps ? applicationCounts() : null,
    canEnroll ? enrollmentCounts() : null,
    canDocs ? documentCounts(monthStart) : null,
    canPrograms ? programOversight(canStudents, canApps) : null,
    canEnroll ? series('enrollments', 'month', 6) : null,
    canApps
      ? prisma.application.findMany({
          where: { createdAt: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, firstName: true, lastName: true, status: true, createdAt: true, program: { select: { name: true, code: true } } },
        })
      : [],
    recentOperations({ applications: canApps, students: canStudents, enrollments: canEnroll, documents: canDocs }, canStudents),
  ]);

  /*
   * KPIs. Each ratio bar is a real "x of y" from the same counts — the
   * reference design's bars, without inventing a target to measure against.
   * No "vs last term" trends: TDMS keeps no per-term snapshots to compare.
   */
  const kpis: Kpi[] = [];
  if (programs) {
    kpis.push({
      key: 'programs', label: 'Programs', value: programs.total, icon: 'programs', href: '/programs',
      hint: programs.total === 0 ? 'None created yet' : `${programs.active} active`,
      progress: programs.total > 0 ? { value: programs.active, max: programs.total, label: `${programs.active} of ${programs.total} programs active` } : undefined,
    });
  }
  if (students) {
    kpis.push({
      key: 'students', label: 'Students', value: students.total, icon: 'students', href: '/students',
      hint: students.total === 0 ? 'No student records yet' : `${students.active} active`,
      tone: students.newThisWeek > 0 ? 'positive' : 'neutral',
      progress: students.total > 0 ? { value: students.active, max: students.total, label: `${students.active} of ${students.total} students active` } : undefined,
    });
    // A count, not a rate: TDMS does not record the cohort a completion rate would need.
    kpis.push({
      key: 'graduated', label: 'Graduates', value: students.graduated, icon: 'active',
      hint: students.graduated === 0 ? 'None recorded yet' : 'Students marked graduated',
      progress: students.total > 0 ? { value: students.graduated, max: students.total, label: `${students.graduated} of ${students.total} students graduated` } : undefined,
    });
  }
  if (apps) {
    const decided = apps.approved + apps.returned;
    kpis.push({
      key: 'applications', label: 'Applications', value: apps.waiting, icon: 'applications', href: '/applications',
      hint: apps.waiting > 0 ? 'Awaiting a decision' : 'None waiting',
      tone: apps.waiting > 0 ? 'attention' : 'neutral',
      progress: apps.total > 0 ? { value: decided, max: apps.total, label: `${decided} of ${apps.total} applications decided` } : undefined,
    });
  }
  if (enroll) {
    const all = enroll.enrolled + enroll.pending + enroll.dropped;
    kpis.push({
      key: 'enrollments', label: 'Enrolled', value: enroll.enrolled, icon: 'enrollment',
      hint: enroll.pending > 0 ? `${enroll.pending} awaiting approval` : 'Current enrollments',
      tone: enroll.pending > 0 ? 'attention' : 'neutral',
      progress: all > 0 ? { value: enroll.enrolled, max: all, label: `${enroll.enrolled} of ${all} enrollments approved` } : undefined,
    });
  }

  const actions: ListItem[] = [];
  if (apps) actions.push({ ...task('d-apps', 'Applications awaiting decision', apps.waiting, 'application', '/applications', 'Nothing awaiting a decision'), icon: 'applications' });
  if (enroll) actions.push({ ...task('d-enroll', 'Enrollments awaiting approval', enroll.pending, 'enrollment', '/students', 'Nothing awaiting approval'), icon: 'enrollment' });
  if (docs) actions.push({ ...task('d-docs', 'Documents under review', docs.toReview, 'document', '/students', 'No documents under review'), icon: 'documents' });
  if (apps) actions.push({ ...task('d-returned', 'Returned applications', apps.returned, 'application', '/applications', 'None returned'), icon: 'applications' });

  const applicationStatus = (status: string) =>
    ({ submitted: 'Submitted', under_review: 'Under review', approved: 'Approved', returned: 'Returned' })[status] ?? capitalise(status);

  return {
    kpis,
    primary: null,
    secondary: null,
    chart: null,
    quickActions: operationalActions(user),
    activity: {
      title: 'Recent Activity',
      description: 'Applications, enrollments and documents',
      items: activity,
      empty: { title: 'No recent activity', description: 'Activity will appear here as the system is used.' },
    },
    director: {
      trend: trend
        ? {
            title: 'Enrollment Trend',
            description: 'Enrollments recorded per month, last 6 months',
            kind: 'bars',
            points: trend,
            unit: 'enrollments',
            empty: { title: 'No enrollments yet', description: 'Monthly enrollments will be charted once they are recorded.' },
          }
        : null,
      distribution:
        perProgram && canStudents
          ? {
              title: 'Enrollment by Program',
              description: 'Student records in each program',
              kind: 'donut',
              points: perProgram.studentPoints,
              unit: 'students',
              empty: {
                title: 'No students recorded',
                description: 'Each program’s headcount will appear once students are recorded.',
                action: { label: 'View students', href: '/students' },
              },
            }
          : null,
      actions: {
        title: 'Director Actions',
        description: 'Decisions and reviews in progress',
        items: actions,
        empty: { title: 'Nothing waiting', description: 'Items needing a decision will be listed here.' },
      },
      oversight: perProgram
        ? {
            id: 'oversight',
            title: 'Program Oversight',
            description: 'Students and pending applications per program',
            viewAll: { label: 'All programs', href: '/programs' },
            columns: [
              { key: 'program', label: 'Program' },
              ...(canStudents ? [{ key: 'students', label: 'Students', align: 'right' as const }] : []),
              ...(canApps ? [{ key: 'pending', label: 'Pending', align: 'right' as const }] : []),
              { key: 'status', label: 'Status', hideOnMobile: true },
            ],
            rows: perProgram.rows,
            empty: { title: 'No programs yet', description: 'Programs appear here once they are created.', action: { label: 'Open programs', href: '/programs' } },
          }
        : null,
      applications: canApps
        ? {
            id: 'applications',
            title: 'Recent Applications',
            description: 'The latest applications received',
            viewAll: { label: 'All applications', href: '/applications' },
            columns: [
              { key: 'applicant', label: 'Applicant' },
              { key: 'program', label: 'Program', hideOnMobile: true },
              { key: 'status', label: 'Status' },
              { key: 'date', label: 'Date', align: 'right', hideOnMobile: true },
            ],
            rows: latestApps.map((a) => ({
              id: a.id.toString(),
              href: '/applications',
              cells: {
                applicant: `${a.firstName} ${a.lastName}`,
                program: a.program.name,
                status: { status: a.status, label: applicationStatus(a.status) },
                date: a.createdAt!.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: institutionTimeZone() }),
              },
            })),
            empty: { title: 'No applications yet', description: 'New applications will be listed here as they arrive.', action: { label: 'Open applications', href: '/applications' } },
          }
        : null,
    },
  };
}

/** One row per program: headcount and waiting applications, in two grouped queries. */
async function programOversight(withStudents: boolean, withApps: boolean) {
  const [programs, students, apps] = await Promise.all([
    prisma.program.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, isActive: true } }),
    withStudents ? prisma.student.groupBy({ by: ['programId'], _count: { _all: true } }) : [],
    withApps
      ? prisma.application.groupBy({ by: ['programId'], where: { status: { in: ['submitted', 'under_review'] } }, _count: { _all: true } })
      : [],
  ]);
  const studentsBy = new Map(students.map((r) => [r.programId.toString(), r._count._all]));
  const appsBy = new Map(apps.map((r) => [r.programId.toString(), r._count._all]));

  const items: ListItem[] = programs.slice(0, 6).map((p) => {
    const headcount = studentsBy.get(p.id.toString()) ?? 0;
    const waiting = appsBy.get(p.id.toString()) ?? 0;
    return {
      id: p.id.toString(),
      title: p.name,
      subtitle: withStudents ? `${p.code} · ${plural(headcount, 'student')}` : p.code,
      meta: withApps ? (waiting > 0 ? `${waiting} waiting` : 'No applications waiting') : undefined,
      status: p.isActive ? { status: 'active', label: 'Active' } : { status: 'inactive', label: 'Inactive' },
      href: `/programs/${p.id}`,
    };
  });

  const studentPoints: ChartPoint[] = programs
    .map((p) => ({ label: p.code, value: studentsBy.get(p.id.toString()) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // The same figures as a table, busiest program first.
  const rows: TableRow[] = programs
    .map((p) => ({ p, headcount: studentsBy.get(p.id.toString()) ?? 0, waiting: appsBy.get(p.id.toString()) ?? 0 }))
    .sort((a, b) => b.headcount - a.headcount || b.waiting - a.waiting || a.p.code.localeCompare(b.p.code))
    .slice(0, 6)
    .map(({ p, headcount, waiting }) => ({
      id: p.id.toString(),
      href: `/programs/${p.id}`,
      cells: {
        program: { text: p.name, sub: p.code },
        students: headcount.toLocaleString('en-US'),
        pending: waiting.toLocaleString('en-US'),
        status: p.isActive ? { status: 'active', label: 'Active' } : { status: 'inactive', label: 'Inactive' },
      },
    }));

  return { items, studentPoints, rows };
}

// --- Coordinator -------------------------------------------------------------------

async function coordinatorView(user: AuthUser): Promise<Body> {
  const canCatalogue = programPolicy.viewAny(user) && curriculumPolicy.viewAny(user);
  const canApps = applicationPolicy.viewAny(user);
  const canEnroll = enrollmentPolicy.viewAny(user);
  // Coordinators may not see student records; nothing below names a student.
  const canStudents = studentPolicy.viewAny(user);

  const [programs, curricula, subjects, apps, enroll, catalogue, activity] = await Promise.all([
    canCatalogue ? programCounts() : null,
    canCatalogue ? prisma.curriculum.count({ where: { isActive: true } }) : null,
    subjectPolicy.viewAny(user) ? prisma.subject.count({ where: { isActive: true } }) : null,
    canApps ? applicationCounts() : null,
    canEnroll ? enrollmentCounts() : null,
    canCatalogue ? catalogueHealth() : null,
    recentOperations({ applications: canApps, students: false, enrollments: canEnroll, documents: false }, canStudents),
  ]);

  const kpis: Kpi[] = [];
  if (programs) kpis.push({ key: 'programs', label: 'Programs', value: programs.total, icon: 'programs', href: '/programs', hint: programs.total === 0 ? 'None created yet' : `${programs.active} active` });
  if (curricula !== null) kpis.push({ key: 'curricula', label: 'Curricula', value: curricula, icon: 'curricula', href: '/programs', hint: curricula === 0 ? 'No active curriculum yet' : 'Active curricula' });
  if (subjects !== null) kpis.push({ key: 'subjects', label: 'Subjects', value: subjects, icon: 'subjects', href: '/subjects', hint: subjects === 0 ? 'Catalogue is empty' : 'Active subjects' });
  if (apps) kpis.push({ key: 'applications', label: 'Applications', value: apps.waiting, icon: 'applications', href: '/applications', hint: apps.waiting > 0 ? 'Awaiting a decision' : 'None waiting', tone: apps.waiting > 0 ? 'attention' : 'neutral' });
  if (enroll) kpis.push({ key: 'enrollments', label: 'Enrollments', value: enroll.pending, icon: 'enrollment', hint: enroll.pending > 0 ? 'Awaiting approval' : 'None waiting', tone: enroll.pending > 0 ? 'attention' : 'neutral' });

  return {
    kpis,
    primary: catalogue
      ? {
          title: 'Coordinator Tasks',
          description: 'Active curricula that still need subjects',
          viewAll: { label: 'Programs', href: '/programs' },
          items: catalogue.gaps,
          empty: {
            title: catalogue.curricula === 0 ? 'No active curricula' : 'Every curriculum has subjects',
            description: catalogue.curricula === 0 ? 'Create a curriculum for a program to start mapping subjects.' : 'Nothing to map right now.',
            action: { label: 'Open programs', href: '/programs' },
          },
        }
      : null,
    secondary: catalogue
      ? {
          title: 'Program Checklist',
          description: 'Is each program ready to enroll into?',
          items: catalogue.checklist,
          empty: { title: 'No programs yet', description: 'Programs appear here once they are created.', action: { label: 'Open programs', href: '/programs' } },
        }
      : null,
    chart: catalogue
      ? {
          title: 'Subjects per Program',
          description: 'Subjects mapped into each program’s active curricula',
          kind: 'breakdown',
          points: catalogue.subjectPoints,
          unit: 'subjects',
          empty: { title: 'No subjects mapped', description: 'Map subjects into a curriculum to see them here.' },
        }
      : null,
    quickActions: operationalActions(user),
    activity: {
      title: 'Recent Activity',
      description: 'Applications and enrollment changes',
      items: activity,
      empty: { title: 'No activity yet', description: 'Applications and enrollment changes will appear here.' },
    },
  };
}

/** Curricula with no subjects, and whether each program has something to enroll into. */
async function catalogueHealth() {
  const [programs, curricula] = await Promise.all([
    prisma.program.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, isActive: true } }),
    prisma.curriculum.findMany({
      where: { isActive: true },
      select: { id: true, programId: true, versionLabel: true, program: { select: { code: true } }, _count: { select: { curriculumSubjects: true } } },
    }),
  ]);

  const gaps: ListItem[] = curricula
    .filter((c) => c._count.curriculumSubjects === 0)
    .slice(0, 6)
    .map((c) => ({
      id: c.id.toString(),
      title: `${c.program.code} · ${c.versionLabel}`,
      subtitle: 'No subjects mapped yet',
      status: { status: 'needs_review', label: 'Needs subjects' },
      href: `/curricula/${c.id}`,
    }));

  const subjectsByProgram = new Map<string, number>();
  for (const c of curricula) {
    const key = c.programId.toString();
    subjectsByProgram.set(key, (subjectsByProgram.get(key) ?? 0) + c._count.curriculumSubjects);
  }

  const checklist: ListItem[] = programs.slice(0, 6).map((p) => {
    const mapped = subjectsByProgram.get(p.id.toString()) ?? 0;
    const hasCurriculum = curricula.some((c) => c.programId === p.id);
    const ready = p.isActive && hasCurriculum && mapped > 0;
    return {
      id: p.id.toString(),
      title: p.name,
      subtitle: !hasCurriculum ? `${p.code} · no active curriculum` : `${p.code} · ${plural(mapped, 'subject')} mapped`,
      status: !p.isActive
        ? { status: 'inactive', label: 'Inactive' }
        : ready
          ? { status: 'completed', label: 'Ready' }
          : { status: 'needs_review', label: 'Incomplete' },
      href: `/programs/${p.id}`,
    };
  });

  const subjectPoints: ChartPoint[] = programs
    .map((p) => ({ label: p.code, value: subjectsByProgram.get(p.id.toString()) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return { gaps, checklist, subjectPoints, curricula: curricula.length };
}

// --- Secretary ---------------------------------------------------------------------

async function secretaryView(user: AuthUser): Promise<Body> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const canStudents = studentPolicy.viewAny(user);
  const canApps = applicationPolicy.viewAny(user);
  const canDocs = studentCredentialPolicy.viewAny(user);
  const canEnroll = enrollmentPolicy.viewAny(user);

  const [apps, docs, students, enroll, queue, waiting, verified, activity] = await Promise.all([
    canApps ? applicationCounts() : null,
    canDocs ? documentCounts(monthStart) : null,
    canStudents ? studentCounts(weekAgo) : null,
    canEnroll ? enrollmentCounts() : null,
    canDocs
      ? prisma.studentCredential.findMany({
          where: { status: { in: ['submitted', 'under_review'] } },
          orderBy: { submittedAt: 'asc' },
          take: 6,
          select: {
            id: true,
            status: true,
            submittedAt: true,
            studentId: true,
            requirement: { select: { name: true } },
            student: { select: { firstName: true, lastName: true, studentNumber: true } },
          },
        })
      : [],
    canApps
      ? prisma.application.findMany({
          where: { status: { in: ['submitted', 'under_review'] } },
          orderBy: { createdAt: 'asc' },
          take: 6,
          select: { id: true, status: true, firstName: true, lastName: true, createdAt: true, program: { select: { code: true } } },
        })
      : [],
    canDocs ? series('credentials_verified', 'month', 6) : null,
    recentOperations({ applications: canApps, students: canStudents, enrollments: canEnroll, documents: canDocs }, canStudents),
  ]);

  const kpis: Kpi[] = [];
  if (apps) kpis.push({ key: 'applications', label: 'Applications', value: apps.waiting, icon: 'applications', href: '/applications', hint: apps.waiting > 0 ? 'Awaiting a decision' : 'None waiting', tone: apps.waiting > 0 ? 'attention' : 'neutral' });
  if (docs) {
    kpis.push({ key: 'docs', label: 'Documents', value: docs.toReview, icon: 'documents', hint: docs.toReview > 0 ? 'Waiting for review' : 'None waiting', tone: docs.toReview > 0 ? 'attention' : 'neutral' });
    kpis.push({ key: 'verified', label: 'Verified', value: docs.verifiedThisMonth, icon: 'active', hint: 'Documents this month', tone: docs.verifiedThisMonth > 0 ? 'positive' : 'neutral' });
  }
  if (students) kpis.push({ key: 'students', label: 'Students', value: students.total, icon: 'students', href: '/students', hint: students.total === 0 ? 'No student records yet' : `${students.active} active` });
  if (enroll) kpis.push({ key: 'enrollments', label: 'Enrollments', value: enroll.pending, icon: 'enrollment', hint: enroll.pending > 0 ? 'Awaiting approval' : 'None waiting', tone: enroll.pending > 0 ? 'attention' : 'neutral' });

  return {
    kpis,
    primary: canDocs
      ? {
          title: 'Document Queue',
          description: 'Oldest submissions first',
          items: queue.map((c) => ({
            id: c.id.toString(),
            title: c.requirement.name,
            subtitle: `${c.student.firstName} ${c.student.lastName} · ${c.student.studentNumber}`,
            at: c.submittedAt?.toISOString(),
            status: c.status === 'under_review' ? { status: 'under_review', label: 'Under review' } : { status: 'submitted', label: 'Submitted' },
            href: `/students/${c.studentId}/enrollment`,
          })),
          empty: { title: 'No documents waiting', description: 'Submitted requirements will queue here for review.' },
        }
      : null,
    secondary: canApps
      ? {
          title: 'Applications to Process',
          description: 'Oldest first',
          viewAll: { label: 'All applications', href: '/applications' },
          items: waiting.map((a) => ({
            id: a.id.toString(),
            title: `${a.firstName} ${a.lastName}`,
            subtitle: a.program.code,
            at: a.createdAt?.toISOString(),
            status: a.status === 'under_review' ? { status: 'under_review', label: 'Under review' } : { status: 'submitted', label: 'Submitted' },
            href: '/applications',
          })),
          empty: { title: 'No applications waiting', description: 'New applications will queue here.' },
        }
      : null,
    chart: verified
      ? {
          title: 'Documents Verified',
          description: 'Per month, last 6 months',
          kind: 'bars',
          points: verified,
          unit: 'documents',
          empty: { title: 'No documents verified yet', description: 'Monthly verifications will be charted here.' },
        }
      : null,
    quickActions: operationalActions(user),
    activity: {
      title: 'Recent Activity',
      description: 'Applications, students, enrollments and documents',
      items: activity,
      empty: { title: 'No activity yet', description: 'Office activity will appear here as it happens.' },
    },
  };
}

// --- Teacher -------------------------------------------------------------------------

const TEACHING_NOTICE = {
  title: 'Classes, assignments, attendance and grades are not in TDMS yet',
  body: 'TDMS does not yet record class sections, schedules, assignments, quizzes, examinations, attendance or grades, so this dashboard does not show them. It shows the programs and subjects you teach within. When those modules are added, they will appear here.',
};

async function teacherView(user: AuthUser): Promise<Body> {
  const canSubjects = subjectPolicy.viewAny(user);
  const canPrograms = programPolicy.viewAny(user);

  const [programs, subjects, curricula, recentSubjects, byType, active] = await Promise.all([
    canPrograms ? programCounts() : null,
    canSubjects ? prisma.subject.count({ where: { isActive: true } }) : null,
    canPrograms ? prisma.curriculum.count({ where: { isActive: true } }) : null,
    canSubjects
      ? prisma.subject.findMany({
          where: { isActive: true },
          orderBy: { code: 'asc' },
          take: 6,
          select: { id: true, code: true, title: true, subjectType: true, defaultUnits: true },
        })
      : [],
    canSubjects ? prisma.subject.groupBy({ by: ['subjectType'], where: { isActive: true }, _count: { _all: true } }) : [],
    canPrograms
      ? prisma.program.findMany({
          where: { isActive: true },
          orderBy: { code: 'asc' },
          take: 6,
          select: { id: true, code: true, name: true, curricula: { where: { isActive: true }, select: { versionLabel: true }, take: 1 } },
        })
      : [],
  ]);

  const kpis: Kpi[] = [];
  if (programs) kpis.push({ key: 'programs', label: 'Programs', value: programs.active, icon: 'programs', href: '/programs', hint: programs.active === 0 ? 'None active yet' : 'Active programs' });
  if (subjects !== null) kpis.push({ key: 'subjects', label: 'Subjects', value: subjects, icon: 'subjects', href: '/subjects', hint: subjects === 0 ? 'Catalogue is empty' : 'In the catalogue' });
  if (curricula !== null) kpis.push({ key: 'curricula', label: 'Curricula', value: curricula, icon: 'curricula', href: '/programs', hint: curricula === 0 ? 'None active yet' : 'Active curricula' });

  return {
    kpis,
    primary: canSubjects
      ? {
          title: 'Subject Catalogue',
          description: 'Active subjects',
          viewAll: { label: 'All subjects', href: '/subjects' },
          items: recentSubjects.map((s) => ({
            id: s.id.toString(),
            title: s.title,
            subtitle: `${s.code} · ${capitalise(s.subjectType)}`,
            meta: `${s.defaultUnits.toNumber()} units`,
          })),
          empty: { title: 'No subjects yet', description: 'Subjects appear here once they are added to the catalogue.' },
        }
      : null,
    secondary: canPrograms
      ? {
          title: 'Programs',
          description: 'Active programs and their current curriculum',
          viewAll: { label: 'All programs', href: '/programs' },
          items: active.map((p) => ({
            id: p.id.toString(),
            title: p.name,
            subtitle: p.curricula[0] ? `${p.code} · ${p.curricula[0].versionLabel}` : `${p.code} · no active curriculum`,
            href: `/programs/${p.id}`,
          })),
          empty: { title: 'No active programs', description: 'Programs appear here once they are created.' },
        }
      : null,
    chart: canSubjects
      ? {
          title: 'Subjects by Type',
          description: 'Lecture, laboratory, practical and more',
          kind: 'breakdown',
          points: byType.map((r) => ({ label: capitalise(r.subjectType), value: r._count._all })).sort((a, b) => b.value - a.value),
          unit: 'subjects',
          empty: { title: 'No subjects yet', description: 'The mix of subject types will appear here.' },
        }
      : null,
    quickActions: operationalActions(user),
    activity: null,
    notice: TEACHING_NOTICE,
  };
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

  const [subjects, requirements, mine, enrollments] = await Promise.all([
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
    quickActions: [profile],
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
    notice: {
      title: 'Assignments, quizzes, examinations, attendance and grades are not in TDMS yet',
      body: 'TDMS does not yet record coursework, attendance or grades, so this dashboard cannot show them. When those modules are added, they will appear here.',
    },
  };
}

