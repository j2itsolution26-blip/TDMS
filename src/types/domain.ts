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
export const STUDENT_STATUSES = ['applicant', 'active', 'transferred', 'archived', 'graduated'] as const;
export const APPLICATION_STATUSES = ['submitted', 'under_review', 'approved', 'returned'] as const;
export const CREDENTIAL_STATUSES = ['missing', 'submitted', 'under_review', 'verified', 'rejected', 'expired'] as const;
/**
 * Account lifecycle. Only ACTIVE may authenticate, and only then with a
 * verified institutional email — the two conditions are independent and both
 * are checked (see src/server/services/auth-service.ts).
 *
 *   PENDING_VERIFICATION  created, email not yet confirmed
 *   ACTIVE                confirmed and permitted to sign in
 *   INACTIVE              deactivated by an administrator, reversible
 *   SUSPENDED             withdrawn for cause, reversible
 */
export const ACCOUNT_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const accountStatusSchema = z.enum(ACCOUNT_STATUSES);

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  PENDING_VERIFICATION: 'Pending verification',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
};

/** Maps an account state onto the x-badge colour vocabulary. */
export const ACCOUNT_STATUS_BADGE: Record<AccountStatus, string> = {
  PENDING_VERIFICATION: 'pending',
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
  roles: string[];
  permissions: string[];
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
  teacher: 'Teacher',
  student: 'Student',
};
