import { requireUser } from '@/server/auth/current-user';
import type { NavGroup, NavItem } from '@shared/types/navigation';
import type { PageRequest } from './types';
import {
  programPolicy,
  subjectPolicy,
  studentPolicy,
  applicationPolicy,
  enrollmentPolicy,
  userPolicy,
  adminAccountPolicy,
  systemPolicy,
  teachingPolicy,
  studentPortalPolicy,
} from '@/server/auth/policies';
import { getNotificationSummary } from '@/server/services/teaching/notifications';
import { dashboardRoleFor } from '@/server/services/dashboard-service';
import { getAdminSetup, getPendingWork, getSearchablePrograms } from '@/server/services/admin-workspace';
import { ROLE_LABELS, type RoleName } from '@shared/types/domain';

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
 * (competencies, reports) are not listed: a link to nothing is worse than no
 * link. The Diploma Instructor's and the Student's sidebars follow the
 * Diploma Instructor module's grouping.
 *
 * Curricula live inside each program (/programs/[id]), and "Teachers" is the
 * Admin's Staff screen, which these roles may not open — so neither has an
 * entry of its own. A Coordinator may not see student records, so the
 * Students link is absent for them by policy.
 */
const ROLE_SIDEBARS: Record<'director' | 'coordinator' | 'secretary' | 'teacher' | 'student', [NavGroup, string[]][]> = {
  director: [
    ['main', ['/dashboard']],
    ['academic', ['/programs', '/subjects', '/school-years']],
    ['people', ['/students']],
    ['admissions', ['/applications', '/enrollments']],
    ['oversight', ['/academic-reviews', '/status-requests', '/learning-support', '/instructors']],
    ['calendar', ['/calendar']],
    ['account', ['/profile']],
  ],
  coordinator: [
    ['main', ['/dashboard']],
    ['academic', ['/programs', '/subjects', '/class-setup', '/school-years']],
    ['people', ['/students']],
    ['admissions', ['/applications', '/enrollments']],
    ['oversight', ['/academic-reviews', '/status-requests', '/learning-support']],
    ['calendar', ['/calendar']],
    ['account', ['/profile']],
  ],
  secretary: [
    ['main', ['/dashboard']],
    ['records', ['/students', '/status-requests']],
    ['admissions', ['/applications', '/enrollments']],
    ['programs', ['/programs']],
    ['calendar', ['/calendar']],
    ['account', ['/profile']],
  ],
  // The Diploma Instructor's sidebar, grouped as the module specifies.
  teacher: [
    ['main', ['/dashboard']],
    ['teaching', ['/teaching/classes', '/teaching/subjects', '/teaching/records', '/teaching/gradebook']],
    ['attendance', ['/teaching/attendance', '/teaching/attendance-records']],
    ['assessments', ['/teaching/quizzes', '/teaching/exams', '/teaching/checking']],
    ['activities', ['/teaching/activities', '/teaching/performance-tasks']],
    ['academic', ['/teaching/students', '/teaching/progress', '/teaching/learning-support']],
    ['documents', ['/teaching/documents/lesson-plans', '/teaching/documents/tos', '/teaching/documents/pt']],
    ['engagement', ['/teaching/badges']],
    ['calendar', ['/calendar']],
    ['profile', ['/profile', '/teaching/pds']],
  ],
  student: [
    ['main', ['/dashboard']],
    ['learning', ['/my/qr', '/my/attendance', '/my/assessments', '/my/grades', '/my/badges']],
    ['calendar', ['/calendar']],
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

export async function loadAppShell(_request: PageRequest) {
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

  // --- The Diploma Instructor module. Each page re-checks the same policy.
  if (teachingPolicy.manageClasses(user)) {
    items.push({ label: 'Classes & Sections', href: '/class-setup', match: ['/class-setup'], icon: 'setup', group: 'academic' });
  }
  if (teachingPolicy.viewSchoolYears(user)) {
    items.push({ label: 'School Years', href: '/school-years', match: ['/school-years'], icon: 'schoolYears', group: 'academic' });
  }
  if (teachingPolicy.viewAcademicDocuments(user)) {
    items.push({ label: 'Academic Documents', href: '/academic-reviews', match: ['/academic-reviews'], icon: 'reviews', group: 'oversight' });
  }
  if (teachingPolicy.viewStatusRequests(user)) {
    items.push({ label: 'Status Requests', href: '/status-requests', match: ['/status-requests'], icon: 'statusRequests', group: 'oversight' });
  }
  if (teachingPolicy.monitorLearningSupport(user)) {
    items.push({ label: 'Learning Support', href: '/learning-support', match: ['/learning-support'], icon: 'support', group: 'oversight' });
  }
  if (teachingPolicy.viewInstructorProfiles(user)) {
    items.push({ label: 'Instructor Profiles', href: '/instructors', match: ['/instructors'], icon: 'instructors', group: 'oversight' });
  }
  if (teachingPolicy.teach(user)) {
    const t = (label: string, href: string, icon: NavItem['icon'], group: NavGroup, match: string[] = [href]) => items.push({ label, href, match, icon, group });
    t('My Classes', '/teaching/classes', 'classes', 'teaching');
    t('My Subjects', '/teaching/subjects', 'subjects', 'teaching');
    t('Class Records', '/teaching/records', 'records', 'teaching');
    t('Gradebook', '/teaching/gradebook', 'gradebook', 'teaching');
    t('QR Attendance', '/teaching/attendance', 'qr', 'attendance');
    t('Attendance Records', '/teaching/attendance-records', 'attendance', 'attendance');
    t('Quizzes', '/teaching/quizzes', 'quiz', 'assessments');
    t('Examinations', '/teaching/exams', 'exam', 'assessments');
    t('Answer Key / Checking', '/teaching/checking', 'checking', 'assessments', ['/teaching/checking', '/teaching/assessments']);
    t('Online Activities', '/teaching/activities', 'activity', 'activities');
    t('Performance Tasks', '/teaching/performance-tasks', 'task', 'activities');
    t('Students', '/teaching/students', 'students', 'academic');
    t('Student Progress', '/teaching/progress', 'progress', 'academic');
    t('Learning Support', '/teaching/learning-support', 'support', 'academic');
    t('Lesson Plans', '/teaching/documents/lesson-plans', 'document', 'documents');
    t('TOS', '/teaching/documents/tos', 'tos', 'documents');
    t('PT', '/teaching/documents/pt', 'task', 'documents');
    t('Badges', '/teaching/badges', 'badge', 'engagement');
    t('PDS', '/teaching/pds', 'pds', 'profile');
  }
  if (studentPortalPolicy.use(user)) {
    items.push({ label: 'My QR Code', href: '/my/qr', match: ['/my/qr'], icon: 'qr', group: 'learning' });
    items.push({ label: 'My Attendance', href: '/my/attendance', match: ['/my/attendance'], icon: 'attendance', group: 'learning' });
    items.push({ label: 'Quizzes & Exams', href: '/my/assessments', match: ['/my/assessments'], icon: 'quiz', group: 'learning' });
    items.push({ label: 'My Grades', href: '/my/grades', match: ['/my/grades'], icon: 'gradebook', group: 'learning' });
    items.push({ label: 'My Badges', href: '/my/badges', match: ['/my/badges'], icon: 'badge', group: 'learning' });
  }
  // The official calendar: everyone signed in may read it.
  items.push({ label: 'School Calendar', href: '/calendar', match: ['/calendar'], icon: 'calendar', group: 'calendar' });

  /*
   * The same role the dashboard is chosen by, so the header and the dashboard
   * never disagree about who you are. roles[0] was whichever row the database
   * returned first, which for a two-role account was not necessarily the one
   * that matters.
   */
  const role = dashboardRoleFor(user);
  const roleLabel = role === 'none' ? 'No role' : ROLE_LABELS[role as RoleName];
  const nav = ROLE_SIDEBARS[role as keyof typeof ROLE_SIDEBARS] ? arrange(items, ROLE_SIDEBARS[role as keyof typeof ROLE_SIDEBARS]) : items;

  const [setup, pending, programs, notifications] = await Promise.all([
    getAdminSetup(user),
    getPendingWork(user),
    getSearchablePrograms(user),
    getNotificationSummary(user),
  ]);
  const currentStep = setup?.steps.find((s) => s.key === setup.current);

  return {
    items: nav,
    user: { name: user.name, email: user.email, roleLabel },
    setup: setup && !setup.complete && currentStep ? { completed: setup.completed, total: setup.total, href: currentStep.href } : null,
    pending: pending.items,
    notifications,
    programs,
    canSearchStudents: studentPolicy.viewAny(user),
  };
}

export type AppShellData = Awaited<ReturnType<typeof loadAppShell>>;
