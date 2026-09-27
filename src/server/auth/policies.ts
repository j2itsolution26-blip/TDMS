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
 * Note the one place it deliberately does NOT apply: userPolicy.toggleActive
 * keeps its self-targeting guard, exactly as the Laravel Staff component
 * had to re-assert with abort_if(), because Gate::before would otherwise let
 * a Super Admin deactivate their own account and lock themselves out.
 */
export function isSuperAdmin(user: AuthUser): boolean {
  return user.roles.includes('super_admin');
}

export function can(user: AuthUser, permission: string): boolean {
  if (isSuperAdmin(user)) return true;
  return user.permissions.includes(permission);
}

/** Roles that may read the academic catalogue, per the Laravel policies. */
const CATALOGUE_VIEWERS = ['admin', 'director', 'coordinator', 'secretary', 'teacher'] as const;
const OFFICE_VIEWERS = ['admin', 'director', 'coordinator', 'secretary'] as const;

/** Role check that respects the Gate::before Super Admin grant. */
function inRoles(user: AuthUser, roles: readonly string[]): boolean {
  return isSuperAdmin(user) || hasAnyRole(user, roles);
}

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
  viewAny: (u: AuthUser) => can(u, 'students.manage'),
  view: (u: AuthUser) => can(u, 'students.manage'),
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

export const userPolicy = {
  viewAny: (u: AuthUser) => can(u, 'accounts.manage'),
  view: (u: AuthUser) => can(u, 'accounts.manage'),
  create: (u: AuthUser) => can(u, 'accounts.manage'),

  /**
   * Admins may manage staff, but only a Super Admin may touch another
   * Super Admin or an Admin. This is the rule that keeps peer admins from
   * escalating against each other.
   */
  update: (u: AuthUser, target: TargetUser) => {
    if (!can(u, 'accounts.manage')) return false;
    const targetIsPrivileged = target.roles.some((r) => r === 'super_admin' || r === 'admin');
    if (targetIsPrivileged && !hasRole(u, 'super_admin')) return false;
    return true;
  },

  /** Nobody may deactivate their own account and lock themselves out. */
  toggleActive: (u: AuthUser, target: TargetUser) => {
    if (target.id === u.id) return false;
    return userPolicy.update(u, target);
  },

  resetPassword: (u: AuthUser, target: TargetUser) => userPolicy.update(u, target),

  delete: (u: AuthUser) => isSuperAdmin(u),
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

  /** Issue or re-issue an access code for an Admin. */
  generateAccessCode: (u: AuthUser, target: TargetUser) =>
    isSuperAdmin(u) && target.id !== u.id,

  /** Replace an Admin's password with a fresh temporary one. */
  resetTemporaryPassword: (u: AuthUser, target: TargetUser) =>
    isSuperAdmin(u) && target.id !== u.id,

  /** Suspend or reactivate. Reversible, and never against oneself. */
  setStatus: (u: AuthUser, target: TargetUser) => isSuperAdmin(u) && target.id !== u.id,
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
