/**
 * Human-readable presentation layer over ROLE_PERMISSIONS. This file
 * changes nothing about authorization — it only maps the real,
 * unchanged permission identifiers and role keys to labels/categories
 * for display. `userHasPermission`/`permissionsForRoles` continue to
 * check the raw strings from `ROLE_PERMISSIONS` exactly as before.
 */
import { ROLE_PERMISSIONS, type RoleName } from "./permissions";

export type PermissionCategory =
  | "Dashboard"
  | "Academic"
  | "Students"
  | "Reports"
  | "Administration"
  | "Security"
  | "System";

export const PERMISSION_LABELS: Record<string, { label: string; category: PermissionCategory }> = {
  "dashboard.view.institutional": { label: "View Institutional Dashboard", category: "Dashboard" },
  "programs.manage": { label: "Manage Programs", category: "Academic" },
  "subjects.manage": { label: "Manage Subjects", category: "Academic" },
  "schedule.manage": { label: "Manage Schedules", category: "Academic" },
  "grades.review-change": { label: "Review Grade Changes", category: "Academic" },
  "grades.publish": { label: "Publish Grades", category: "Academic" },
  "grades.enter": { label: "Enter Grades", category: "Academic" },
  "grades.request-change": { label: "Request Grade Change", category: "Academic" },
  "practicum.manage": { label: "Manage Practicum", category: "Academic" },
  "practicum.evaluate": { label: "Evaluate Practicum", category: "Academic" },
  "graduation.evaluate": { label: "Evaluate Graduation", category: "Academic" },
  "attendance.record": { label: "Record Attendance", category: "Academic" },
  "applications.review": { label: "Review Applications", category: "Students" },
  "credentials.verify": { label: "Verify Credentials", category: "Students" },
  "students.manage": { label: "Manage Students", category: "Students" },
  "students.enroll": { label: "Enroll Students", category: "Students" },
  "academic-records.view.own": { label: "View Own Academic Records", category: "Students" },
  "reports.view.full": { label: "View Full Reports", category: "Reports" },
  "reports.view.limited": { label: "View Limited Reports", category: "Reports" },
  "reports.view.own-classes": { label: "View Own Class Reports", category: "Reports" },
  "accounts.manage": { label: "Manage Accounts", category: "Administration" },
  "audit-logs.view": { label: "View Audit Logs", category: "Security" },
  "audit-logs.view.scoped": { label: "View Scoped Audit Logs", category: "Security" },
  "system.configure": { label: "Configure System", category: "System" },
};

export function presentPermission(permission: string): { label: string; category: PermissionCategory } {
  return PERMISSION_LABELS[permission] ?? { label: permission, category: "System" };
}

export const ROLE_META: Record<RoleName, { label: string; description: string; icon: string; highestAccess?: boolean }> = {
  super_admin: { label: "Super Admin", description: "System Administrator", icon: "super_admin", highestAccess: true },
  admin: { label: "Admin", description: "Daily Operations Administrator", icon: "admin" },
  director: { label: "TVET Director", description: "Institutional Oversight", icon: "director" },
  coordinator: { label: "TVET Coordinator", description: "Academic Operations", icon: "coordinator" },
  secretary: { label: "TVET Secretary", description: "Enrollment & Records", icon: "secretary" },
  teacher: { label: "Teacher", description: "Classroom & Grading", icon: "teacher" },
  student: { label: "Student", description: "Personal Academic Access", icon: "student" },
};

/** Preserves ROLE_PERMISSIONS's own key order — already the real hierarchy. */
export const ROLE_ORDER = Object.keys(ROLE_PERMISSIONS) as RoleName[];

export function allPermissionKeys(): string[] {
  const set = new Set<string>();
  for (const perms of Object.values(ROLE_PERMISSIONS)) {
    perms.forEach((p) => set.add(p));
  }
  return Array.from(set);
}

export function categoryBreakdown(role: RoleName): { category: PermissionCategory; count: number }[] {
  const counts = new Map<PermissionCategory, number>();
  for (const permission of ROLE_PERMISSIONS[role]) {
    const { category } = presentPermission(permission);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
}
