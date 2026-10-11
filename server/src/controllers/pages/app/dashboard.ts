import { requireUser } from '@/server/auth/current-user';
import { dashboardRoleFor, getDashboardView, greeting, formatToday } from '@/server/services/dashboard-service';
import { assessmentDashboard } from '@/server/services/assessment-center/options';
import { institutionMonitoring } from '@/server/services/monitoring';
import { announcementsFor } from '@/server/services/announcements';
import { instructorDashboard } from '@/server/services/teaching/instructor-dashboard';
import { greetingForHour, formatLongDate, hourIn } from '@shared/lib/greeting';
import { institutionTimeZone } from '@shared/lib/institution-time';
import type { PageRequest } from '@/server/controllers/pages/types';

/**
 * /dashboard — one page for every role, each getting its own workspace.
 * Greeting and date start in the institution's timezone; the role
 * dashboards switch them to the viewer's own in the browser.
 */
export async function loadDashboard(_request: PageRequest) {
  const user = await requireUser();
  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;
  const now = new Date();
  const tz = institutionTimeZone();

  // The Diploma Instructor's own workspace, from one consolidated service call.
  if (dashboardRoleFor(user) === 'teacher') {
    return {
      kind: 'teacher' as const,
      data: await instructorDashboard(user, now),
      announcements: await announcementsFor(user, 5),
      firstName,
      greeting: greetingForHour(hourIn(now, tz)),
    };
  }

  // The TVET Assessment Center Manager's workspace.
  if (dashboardRoleFor(user) === 'assessment_center_manager') {
    return {
      kind: 'assessment' as const,
      data: await assessmentDashboard(now),
      firstName,
      greeting: greetingForHour(hourIn(now, tz)),
      date: formatLongDate(now, tz),
    };
  }

  const view = await getDashboardView(user);

  if (view.admin) {
    return { kind: 'admin' as const, panels: view.admin, monitoring: await institutionMonitoring(now), firstName, greeting: greetingForHour(hourIn(now, tz)), date: formatLongDate(now, tz) };
  }

  // The TVET Director, Coordinator and Secretary: one design system, three workspaces.
  if (view.workspace) {
    return {
      kind: 'workspace' as const,
      workspace: view.workspace,
      // The Director monitors the institution; the Coordinator and Secretary do not.
      monitoring: view.workspace.kind === 'director' ? await institutionMonitoring(now) : null,
      common: { firstName, greeting: greetingForHour(hourIn(now, tz)), date: formatLongDate(now, tz), description: view.description },
    };
  }

  return {
    kind: 'generic' as const,
    view,
    firstName,
    hasMain: Boolean(view.primary || view.secondary || view.chart),
    greeting: greeting(),
    today: formatToday(),
    announcements: await announcementsFor(user, 5),
  };
}
