import { z } from 'zod';

/**
 * Status vocabularies.
 *
 * These are the exact strings the PostgreSQL CHECK constraints allow — the
 * columns are varchar(255), not native enums (see prisma/schema.prisma), so
 * these unions plus the Zod schemas below are what stop an invalid value
 * reaching the database and tripping a constraint violation at runtime.
 */

export const SUBJECT_TYPES = ['lecture', 'laboratory', 'practical', 'capstone', 'ojt'] as const;
export const STUDENT_STATUSES = ['applicant', 'active', 'transferred', 'archived', 'graduated', 'dropped', 'inactive'] as const;
export const APPLICATION_STATUSES = ['submitted', 'under_review', 'approved', 'returned'] as const;
export const CREDENTIAL_STATUSES = ['missing', 'submitted', 'under_review', 'verified', 'rejected', 'expired'] as const;
/**
 * Account lifecycle. Only ACTIVE may enter the application.
 *
 *   PENDING    created but the address is not yet confirmed. Reached by a
 *              staff invitation before the link is opened, and by a Google
 *              self-registration that no administrator has acted on.
 *   ACTIVE     permitted to sign in
 *   INACTIVE   deactivated by an administrator, reversible
 *   SUSPENDED  withdrawn for cause, reversible
 *
 * These four are ACCOUNT STATES and nothing else. Progress through a setup
 * flow is deliberately NOT recorded here — an Admin created by a Super Admin
 * is ACTIVE from the moment it exists, and the separate technical facts
 * `mustChangePassword` on the row and the access-code requirement at sign-in
 * are what hold it back. Overloading a status with "has not finished setting
 * up" is how a state called PENDING ends up labelled "pending approval" and
 * meaning three different things.
 *
 * Google authentication and application authorization are different things:
 * Google proving who someone is does not make their TDMS account ACTIVE.
 */
export const ACCOUNT_STATUSES = [
  'PENDING',
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const accountStatusSchema = z.enum(ACCOUNT_STATUSES);

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  // Not "pending approval": there is no approval queue. The address has
  // simply not been confirmed yet.
  PENDING: 'Pending verification',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
};

/** Maps an account state onto the x-badge colour vocabulary. */
export const ACCOUNT_STATUS_BADGE: Record<AccountStatus, string> = {
  PENDING: 'pending',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'rejected',
};

export const ENROLLMENT_STATUSES = ['pending', 'enrolled', 'dropped'] as const;

export type SubjectType = (typeof SUBJECT_TYPES)[number];
export type StudentStatus = (typeof STUDENT_STATUSES)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const subjectTypeSchema = z.enum(SUBJECT_TYPES);
export const studentStatusSchema = z.enum(STUDENT_STATUSES);
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
export const credentialStatusSchema = z.enum(CREDENTIAL_STATUSES);
export const enrollmentStatusSchema = z.enum(ENROLLMENT_STATUSES);

/**
 * Roles, exactly as RolesAndPermissionsSeeder defines them. No role is
 * added, removed or renamed by the migration.
 */
export const ROLES = [
  'super_admin',
  'admin',
  'director',
  'coordinator',
  'secretary',
  'teacher',
  'student',
] as const;

export type RoleName = (typeof ROLES)[number];

/** Every permission string in the Laravel role/permission matrix. */
export const PERMISSIONS = [
  'dashboard.view.institutional',
  'programs.manage',
  'subjects.manage',
  'schedule.manage',
  'grades.review-change',
  'grades.publish',
  'grades.enter',
  'grades.request-change',
  'practicum.manage',
  'practicum.evaluate',
  'graduation.evaluate',
  'reports.view.full',
  'reports.view.limited',
  'reports.view.own-classes',
  'audit-logs.view',
  'audit-logs.view.scoped',
  'accounts.manage',
  'system.configure',
  'applications.review',
  'credentials.verify',
  'students.manage',
  'students.enroll',
  'attendance.record',
  'academic-records.view.own',
] as const;

export type PermissionName = (typeof PERMISSIONS)[number];

/** The signed-in principal, as assembled once per request. */
export interface AuthUser {
  id: string;
  name: string;
  username: string | null;
  email: string;
  status: AccountStatus;
  emailVerifiedAt: Date | null;
  /**
   * True while this account is still on a temporary password issued by a
   * Super Admin. A fact about the credential, not about the account: the
   * status is ACTIVE either way. requireUser() and requireApiUser() divert
   * the holder to the change-password screen until it is cleared.
   */
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
}

/**
 * What the Super Admin verification screen is told about a registration that
 * is waiting on an emailed code.
 *
 * This is the whole contract between the server and that screen, and it is
 * deliberately thin. There is no code in it, no hash, no password, and no
 * identifier for the pending row — the browser is identified by an HttpOnly
 * cookie it cannot read, so none of those has to cross.
 *
 * The countdowns are seconds remaining at the moment of the response, not
 * absolute times, so a clock that is wrong on either machine cannot make a
 * code look live when it has expired or vice versa.
 */
export interface PendingRegistration {
  email: string;
  expiresInSeconds: number;
  resendInSeconds: number;
  resendsRemaining: number;
  attemptsRemaining: number;
  verified: boolean;
  completionInSeconds: number;
}

/** Display labels, carried over from the Blade templates verbatim. */
export const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  lecture: 'Lecture',
  laboratory: 'Laboratory',
  practical: 'Practical',
  capstone: 'Capstone',
  ojt: 'OJT',
};

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  applicant: 'Applicant',
  active: 'Active',
  transferred: 'Transferred',
  archived: 'Archived',
  graduated: 'Graduated',
  dropped: 'Dropped',
  inactive: 'Inactive',
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  returned: 'Returned',
};

export const CREDENTIAL_STATUS_LABELS: Record<CredentialStatus, string> = {
  missing: 'Missing',
  submitted: 'Submitted',
  under_review: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
  expired: 'Expired',
};

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  pending: 'Pending',
  enrolled: 'Enrolled',
  dropped: 'Dropped',
};

export const ROLE_LABELS: Record<RoleName, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  director: 'Director',
  coordinator: 'Coordinator',
  secretary: 'Secretary',
  // The role key stays `teacher` — role rows, permissions and assignments
  // reference it. Only what people read changes.
  teacher: 'Diploma Instructor',
  student: 'Student',
};
