/**
 * Role -> permission matrix. Kept in one place and used everywhere a
 * check is needed (layouts, route handlers, server actions, the seed
 * script) instead of `if (role === 'admin')` scattered through pages —
 * ported from the original Laravel app's role/permission seeder as
 * the source of truth at migration time.
 *
 * No "server-only" import here deliberately: the seed script (run via
 * tsx, outside Next's bundler) needs this too.
 */
export const ROLE_PERMISSIONS = {
  super_admin: [
    "dashboard.view.institutional",
    "programs.manage",
    "subjects.manage",
    "schedule.manage",
    "grades.review-change",
    "grades.publish",
    "practicum.manage",
    "graduation.evaluate",
    "reports.view.full",
    "audit-logs.view",
    "accounts.manage",
    "system.configure",
  ],
  admin: [
    "dashboard.view.institutional",
    "programs.manage",
    "subjects.manage",
    "schedule.manage",
    "grades.review-change",
    "grades.publish",
    "graduation.evaluate",
    "reports.view.full",
    "audit-logs.view",
    "accounts.manage",
    "applications.review",
    "credentials.verify",
    "students.manage",
    "students.enroll",
  ],
  director: [
    "dashboard.view.institutional",
    "programs.manage",
    "subjects.manage",
    "grades.review-change",
    "grades.publish",
    "graduation.evaluate",
    "reports.view.full",
    "audit-logs.view",
    "accounts.manage",
  ],
  coordinator: [
    "dashboard.view.institutional",
    "programs.manage",
    "subjects.manage",
    "schedule.manage",
    "grades.review-change",
    "grades.publish",
    "practicum.manage",
    "graduation.evaluate",
    "reports.view.full",
    "audit-logs.view.scoped",
  ],
  secretary: [
    "applications.review",
    "credentials.verify",
    "students.manage",
    "students.enroll",
    "reports.view.limited",
  ],
  teacher: [
    "attendance.record",
    "grades.enter",
    "grades.request-change",
    "practicum.evaluate",
    "reports.view.own-classes",
  ],
  student: ["academic-records.view.own"],
} as const;

export type RoleName = keyof typeof ROLE_PERMISSIONS;
export type Permission = (typeof ROLE_PERMISSIONS)[RoleName][number];

export function permissionsForRoles(roles: string[]): Set<string> {
  const perms = new Set<string>();
  for (const role of roles) {
    const rolePerms = ROLE_PERMISSIONS[role as RoleName];
    if (rolePerms) rolePerms.forEach((p) => perms.add(p));
  }
  return perms;
}
