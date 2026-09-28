import type { AuthUser } from '@/types/domain';

/**
 * Direct port of app/Policies/*.php.
 *
 * Each function below is the same decision the corresponding Laravel policy
 * method made, with identical role and permission checks. Nothing was
 * loosened: where the Laravel policy returned false unconditionally (every
 * `delete`), so does this.
 *
 * These are pure functions of the principal, so they are safe to call on
 * both sides of the render boundary. That matters for keeping the UI honest
 * — but the server always re-checks before acting (Phase 5): hiding a button
 * is presentation, never enforcement.
 */

export function hasRole(user: AuthUser, role: string): boolean {
  return user.roles.includes(role);
}

export function hasAnyRole(user: AuthUser, roles: readonly string[]): boolean {
  return roles.some((r) => user.roles.includes(r));
}

/**
 * AppServiceProvider registered `Gate::before(fn ($user) => $user->hasRole
 * ('super_admin') ? true : null)`, so a Super Admin short-circuited every
 * ability check before the policy ran. That blanket grant is reproduced
 * here rather than being quietly dropped — omitting it would strip the
 * Super Admin of access the Laravel app gave them.
 *
 * It deliberately does NOT apply in two places:
 *
 *   * userPolicy as a whole. Staff accounts are managed by the Admin, and the
 *     Super Admin's role is system maintenance — creating Admins, not
 *     Teachers. See `managesStaff` below.
 *   * adminAccountPolicy's self-targeting guards, because Gate::before would
 *     otherwise let a Super Admin suspend their own account and lock the
 *     institution out.
 */
export function isSuperAdmin(user: AuthUser): boolean {
  return user.roles.includes('super_admin');
}

/**
 * What a Super Admin may DO, as opposed to see.
 *
 * The TDMS structure: the Super Admin controls the system — configuration,
 * security, audit, oversight — and "shouldn't be processing daily enrollment,
 * classes, attendance, or grades". So the Laravel-era blanket grant no longer
 * covers the operational permissions (programs.manage, students.manage,
 * students.enroll, applications.review, credentials.verify, grades.*, …): those
 * belong to the Admin and the TVET roles below them.
 *
 * Reading is unaffected. Every view policy goes through inRoles(), which still
 * admits the Super Admin, so they can see system-wide activity; they just
 * cannot act on it.
 *
 * An explicit allow-list rather than the Super Admin role's database rows, so a
 * stray grant in role_has_permissions cannot hand operational power back.
 */
const SUPER_ADMIN_PERMISSIONS: ReadonlySet<string> = new Set([
  'dashboard.view.institutional',
  'reports.view.full',
  'audit-logs.view',
  'system.configure',
]);

export function can(user: AuthUser, permission: string): boolean {
  if (isSuperAdmin(user)) return SUPER_ADMIN_PERMISSIONS.has(permission);
  return user.permissions.includes(permission);
}

/** Roles that may read the academic catalogue, per the Laravel policies. */
const CATALOGUE_VIEWERS = ['admin', 'director', 'coordinator', 'secretary', 'teacher'] as const;
const OFFICE_VIEWERS = ['admin', 'director', 'coordinator', 'secretary'] as const;

/**
 * Role check for VIEWING, which still admits the Super Admin: oversight of
 * system-wide activity is part of their job. Acting goes through can(), which
 * does not.
 */
function inRoles(user: AuthUser, roles: readonly string[]): boolean {
  return isSuperAdmin(user) || hasAnyRole(user, roles);
}

/**
 * Who may SEE student records: the Admin and Secretary who manage them, the
 * Director who monitors them ("How is the TVET program performing?"), and the
 * Super Admin for oversight. Managing them still needs students.manage.
 */
const STUDENT_VIEWERS = ['admin', 'director', 'secretary'] as const;

// --- ProgramPolicy ---------------------------------------------------------

export const programPolicy = {
  viewAny: (u: AuthUser) => inRoles(u, CATALOGUE_VIEWERS),
  view: (u: AuthUser) => inRoles(u, CATALOGUE_VIEWERS),
  create: (u: AuthUser) => can(u, 'programs.manage'),
  update: (u: AuthUser) => can(u, 'programs.manage'),
  delete: (u: AuthUser) => isSuperAdmin(u),
};

// --- CurriculumPolicy ------------------------------------------------------

export const curriculumPolicy = {
  viewAny: (u: AuthUser) => inRoles(u, CATALOGUE_VIEWERS),
  view: (u: AuthUser) => inRoles(u, CATALOGUE_VIEWERS),
  create: (u: AuthUser) => can(u, 'programs.manage'),
  update: (u: AuthUser) => can(u, 'programs.manage'),
  delete: (u: AuthUser) => isSuperAdmin(u),
};

// --- CurriculumSubjectPolicy ----------------------------------------------

export const curriculumSubjectPolicy = {
  viewAny: (u: AuthUser) => inRoles(u, CATALOGUE_VIEWERS),
  view: (u: AuthUser) => inRoles(u, CATALOGUE_VIEWERS),
  create: (u: AuthUser) => can(u, 'subjects.manage'),
  update: (u: AuthUser) => can(u, 'subjects.manage'),
  // The only policy in the app whose delete is not a flat false.
  delete: (u: AuthUser) => can(u, 'subjects.manage'),
};

// --- SubjectPolicy ---------------------------------------------------------

export const subjectPolicy = {
  viewAny: (u: AuthUser) => inRoles(u, CATALOGUE_VIEWERS),
  view: (u: AuthUser) => inRoles(u, CATALOGUE_VIEWERS),
  create: (u: AuthUser) => can(u, 'subjects.manage'),
  update: (u: AuthUser) => can(u, 'subjects.manage'),
  delete: (u: AuthUser) => isSuperAdmin(u),
};

// --- StudentPolicy ---------------------------------------------------------

export const studentPolicy = {
  viewAny: (u: AuthUser) => inRoles(u, STUDENT_VIEWERS) || can(u, 'students.manage'),
  view: (u: AuthUser) => inRoles(u, STUDENT_VIEWERS) || can(u, 'students.manage'),
  create: (u: AuthUser) => can(u, 'students.manage'),
  update: (u: AuthUser) => can(u, 'students.manage'),
  delete: (u: AuthUser) => isSuperAdmin(u),
};

// --- ApplicationPolicy -----------------------------------------------------

export const applicationPolicy = {
  viewAny: (u: AuthUser) => inRoles(u, OFFICE_VIEWERS),
  view: (u: AuthUser) => inRoles(u, OFFICE_VIEWERS),
  create: (u: AuthUser) => can(u, 'applications.review'),
  review: (u: AuthUser) => can(u, 'applications.review'),
  delete: (u: AuthUser) => isSuperAdmin(u),
};

// --- CredentialRequirementPolicy ------------------------------------------

export const credentialRequirementPolicy = {
  viewAny: (u: AuthUser) => inRoles(u, OFFICE_VIEWERS),
  create: (u: AuthUser) => inRoles(u, ['admin', 'director', 'coordinator']),
  update: (u: AuthUser) => inRoles(u, ['admin', 'director', 'coordinator']),
  delete: (u: AuthUser) => isSuperAdmin(u),
};

// --- StudentCredentialPolicy ----------------------------------------------

export const studentCredentialPolicy = {
  viewAny: (u: AuthUser) => inRoles(u, OFFICE_VIEWERS),
  view: (u: AuthUser) => inRoles(u, OFFICE_VIEWERS),
  verify: (u: AuthUser) => can(u, 'credentials.verify'),
  delete: (u: AuthUser) => isSuperAdmin(u),
};

// --- EnrollmentPolicy ------------------------------------------------------

export const enrollmentPolicy = {
  viewAny: (u: AuthUser) => inRoles(u, OFFICE_VIEWERS),
  view: (u: AuthUser) => inRoles(u, OFFICE_VIEWERS),
  create: (u: AuthUser) => can(u, 'students.enroll'),
  transition: (u: AuthUser) => can(u, 'students.enroll'),
  delete: (u: AuthUser) => isSuperAdmin(u),
};

// --- UserPolicy ------------------------------------------------------------

/** The subject of a staff-account decision: just enough to judge it. */
export interface TargetUser {
  id: string;
  roles: string[];
}

/**
 * Who manages staff accounts: the Admin.
 *
 *   SUPER ADMIN   system maintenance — creates and controls Admins
 *        │
 *      ADMIN       creates and manages staff
 *        ├── Director, Coordinator, Secretary, Teacher
 *
 * Two things this deliberately does not use:
 *
 *   * `can()`. Its Gate::before short-circuit would hand the Super Admin the
 *     Staff screen, and the Super Admin's job is maintaining the system, not
 *     staffing it. The permission is read straight off the principal instead.
 *
 *   * a role check. Access follows `accounts.manage`, so moving staff
 *     management to another role later is a permission change in the database
 *     rather than a code change. Only `admin` holds it — see the migration
 *     20260927010000_staff_management_admin_only.
 *
 * The Super Admin exclusion is explicit rather than relying on their role not
 * holding the permission, so a stray grant in the database cannot quietly
 * bring it back.
 */
export function managesStaff(u: AuthUser): boolean {
  if (isSuperAdmin(u)) return false;
  return u.permissions.includes('accounts.manage');
}

export const userPolicy = {
  viewAny: (u: AuthUser) => managesStaff(u),
  view: (u: AuthUser) => managesStaff(u),
  create: (u: AuthUser) => managesStaff(u),

  /**
   * Never a privileged account. Admins are managed by the Super Admin from
   * Admin Accounts, so a staff manager touching one here would let peer Admins
   * escalate against each other.
   */
  update: (u: AuthUser, target: TargetUser) => {
    if (!managesStaff(u)) return false;
    const targetIsPrivileged = target.roles.some((r) => r === 'super_admin' || r === 'admin');
    return !targetIsPrivileged;
  },

  /** Nobody may deactivate their own account and lock themselves out. */
  toggleActive: (u: AuthUser, target: TargetUser) => {
    if (target.id === u.id) return false;
    return userPolicy.update(u, target);
  },

  resetPassword: (u: AuthUser, target: TargetUser) => userPolicy.update(u, target),

  /** Staff accounts are deactivated or suspended, never deleted. */
  delete: () => false,
};

// --- AdminAccountPolicy ----------------------------------------------------

/**
 * Who may administer Admin accounts: the Super Admin, and nobody else.
 *
 * Note what these do NOT use. `can(u, 'accounts.manage')` would be the
 * obvious check, and it would be wrong twice over: the `admin` role holds
 * that permission, so an Admin could create peers and issue their access
 * codes — and issuing your own access code is not a second factor, it is a
 * formality. `isSuperAdmin` is checked directly, so the Gate::before blanket
 * grant cannot widen it either.
 *
 * The self-targeting guards are the other half. A Super Admin suspending
 * their own account locks the institution out of its own system, and a Super
 * Admin resetting their own password through this screen would bypass the
 * ordinary change-password flow.
 */
export const adminAccountPolicy = {
  viewAny: (u: AuthUser) => isSuperAdmin(u),
  create: (u: AuthUser) => isSuperAdmin(u),

  /** Replace an Admin's password with a fresh temporary one. */
  resetTemporaryPassword: (u: AuthUser, target: TargetUser) =>
    isSuperAdmin(u) && target.id !== u.id,

  /** Suspend or reactivate. Reversible, and never against oneself. */
  setStatus: (u: AuthUser, target: TargetUser) => isSuperAdmin(u) && target.id !== u.id,

  /**
   * The Access Codes page: list, view, generate, revoke. The service refuses
   * any target that is not an ordinary Admin, so a Super Admin can never issue
   * a code to themselves or to another Super Admin.
   */
  manageAccessCodes: (u: AuthUser) => isSuperAdmin(u),
};

/**
 * Does this principal have to clear an access code before they are let in?
 *
 * Derived from the role rather than stored on the row, so it cannot drift out
 * of step with who is actually an Admin. A column saying "this one needs a
 * code" would be one stale write away from an Admin who does not.
 *
 * A Super Admin is exempt: their privileged operations are confirmed with the
 * static security code instead (see src/server/auth/super-admin-code.ts), and
 * making them depend on a code somebody else issues would mean the first
 * Super Admin could never sign in at all.
 */
export function requiresAdminAccessCode(roles: readonly string[]): boolean {
  if (roles.includes('super_admin')) return false;
  return roles.includes('admin');
}

// --- System (Super Admin) --------------------------------------------------

/**
 * The Super Admin's system screens — "Who controls the system?". Checked with
 * isSuperAdmin directly: the audit trail and the system's health are security
 * controls, and the TDMS structure keeps them from the Admin so that a
 * compromised Admin account cannot read or reason about them.
 */
export const systemPolicy = {
  viewAuditLogs: (u: AuthUser) => isSuperAdmin(u),
  viewSystemHealth: (u: AuthUser) => isSuperAdmin(u),
};
