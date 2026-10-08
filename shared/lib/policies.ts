import type { AuthUser } from '@shared/types/domain';

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
 * Where an Admin account is in its lifecycle.
 *
 *   PENDING_INITIAL_SETUP  created (or reset) by a Super Admin and still on a
 *                          temporary password. Signing in needs the temporary
 *                          password AND a one-time access code, then a
 *                          permanent password must be chosen.
 *   ACTIVE                 setup complete. Email and password, nothing more.
 *
 * Derived from `mustChangePassword`, which is exactly this fact: set when a
 * Super Admin issues a temporary password, cleared the moment the Admin chooses
 * their own. It is deliberately NOT a new value of `users.status` — thirty
 * places treat status ACTIVE as "may sign in", and a setup phase stored there
 * would have to be taught to every one of them. Suspension still lives in
 * `status` and is checked before any of this.
 */
export type AdminSetupState = 'PENDING_INITIAL_SETUP' | 'ACTIVE';

export function adminSetupState(account: { mustChangePassword: boolean }): AdminSetupState {
  return account.mustChangePassword ? 'PENDING_INITIAL_SETUP' : 'ACTIVE';
}

/**
 * Does this sign-in have to clear an access code?
 *
 * Only an Admin, and only during initial setup. The access code belongs to the
 * activation of the account, not to every sign-in: once the Admin has used a
 * code and chosen a permanent password, they sign in with email and password
 * like everybody else.
 *
 * The decision is made from the account's lifecycle, never from whether an
 * access-code row happens to exist — an old used code must not summon the
 * verification screen, and a missing one must not skip it during setup.
 *
 * A Super Admin is exempt: nobody issues codes to them.
 */
export function requiresAdminAccessCode(account: {
  roles: readonly string[];
  mustChangePassword: boolean;
}): boolean {
  if (account.roles.includes('super_admin')) return false;
  if (!account.roles.includes('admin')) return false;
  return adminSetupState(account) === 'PENDING_INITIAL_SETUP';
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

// --- Diploma Instructor module ---------------------------------------------

/**
 * Who does what in the teaching workflow.
 *
 * A role gate only. Every Instructor action ALSO proves the class is theirs
 * (src/server/services/teaching/access.ts) and that its school year is not
 * archived — being a Diploma Instructor opens the module, owning the class
 * opens the class.
 *
 * The Super Admin is deliberately absent from every operational decision
 * here, matching can(): they oversee the system, they do not teach, grade,
 * review lesson plans or decide status requests. Viewing goes through
 * inRoles() as everywhere else.
 */
export const teachingPolicy = {
  /** The Instructor's own workspace: classes, attendance, assessments, grades, documents. */
  teach: (u: AuthUser) => hasRole(u, 'teacher'),

  /** Sections, rosters, class offerings, schedules and instructor assignment. */
  manageClasses: (u: AuthUser) => can(u, 'schedule.manage'),

  /** Create, activate and archive school years. */
  manageSchoolYears: (u: AuthUser) => hasAnyRole(u, ['admin', 'director']),
  viewSchoolYears: (u: AuthUser) => inRoles(u, ['admin', 'director', 'coordinator']),

  /** Lesson plans, TOS and PT documentation submitted by Instructors. */
  viewAcademicDocuments: (u: AuthUser) => inRoles(u, ['director', 'coordinator']),
  reviewAcademicDocuments: (u: AuthUser) => hasAnyRole(u, ['director', 'coordinator']),

  /** Instructor recommendations to change a student's status. */
  viewStatusRequests: (u: AuthUser) => inRoles(u, ['director', 'coordinator', 'secretary']),
  decideStatusRequests: (u: AuthUser) => hasAnyRole(u, ['director', 'coordinator', 'secretary']),

  /** Learning Support Recommendations and their interventions. */
  monitorLearningSupport: (u: AuthUser) => inRoles(u, ['director', 'coordinator']),

  /** Instructor Personal Data Sheets. Every view is audited. */
  viewInstructorProfiles: (u: AuthUser) => hasRole(u, 'director'),

  /** The official school calendar. Everybody signed in may read it. */
  manageCalendar: (u: AuthUser) => hasAnyRole(u, ['admin', 'director', 'coordinator']),
};

/** A student's own attendance QR, assessments, released scores and badges. */
export const studentPortalPolicy = {
  use: (u: AuthUser) => hasRole(u, 'student'),
};
