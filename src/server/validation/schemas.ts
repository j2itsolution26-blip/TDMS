import { z } from 'zod';
import {
  subjectTypeSchema,
  studentStatusSchema,
  applicationStatusSchema,
  enrollmentStatusSchema,
  ROLES,
} from '@/types/domain';

/**
 * Zod replacements for the Laravel validation rules that lived in the Volt
 * components' `rules()` methods and in App\Livewire\Forms\LoginForm.
 *
 * Rule-for-rule equivalents:
 *   required            -> .min(1) on strings / required key
 *   nullable            -> .nullable() (empty string normalised to null)
 *   string|max:255      -> z.string().max(255)
 *   email               -> z.string().email()
 *   boolean             -> z.boolean()
 *   integer|min:x|max:y -> z.coerce.number().int().min(x).max(y)
 *   numeric             -> z.coerce.number()
 *   date                -> z.coerce.date()
 *   in:a,b,c            -> z.enum([...])
 *   exists:table,id     -> a foreign-key id, re-checked in the service
 *                          against the database (Zod cannot see the DB)
 *   unique:table,col    -> likewise enforced in the service + DB constraint
 */

/** Blank optional inputs arrive as "" from HTML forms; store NULL instead. */
const nullableString = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

const nullableEmail = z
  .string()
  .trim()
  .max(255)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .refine((v) => v === null || z.string().email().safeParse(v).success, {
    message: 'Please enter a valid email address.',
  });

const nullableDate = z
  .union([z.string(), z.date()])
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), {
    message: 'Please enter a valid date.',
  })
  .transform((v) => (v === null ? null : new Date(v)));

/** Database ids arrive from forms as strings; normalise to bigint. */
export const idSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .refine((v) => /^\d+$/.test(String(v)), { message: 'Invalid identifier.' })
  .transform((v) => BigInt(String(v)));

// --- Authentication --------------------------------------------------------

export const loginSchema = z.object({
  /**
   * Deliberately NOT .email(). The field is labelled "Username or Email"
   * and must accept both; validating it as an email is precisely what
   * stopped usernames from ever reaching the lookup.
   */
  identifier: z.string().trim().min(1, 'Please enter your username or email.').max(255),
  password: z.string().min(1, 'Please enter your password.'),
  remember: z.boolean().default(false),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Please enter your email address.').email().max(255),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    email: z.string().trim().email().max(255),
    password: z.string().min(8, 'The password must be at least 8 characters.'),
    passwordConfirmation: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirmation, {
    message: 'The password confirmation does not match.',
    path: ['passwordConfirmation'],
  });

export const updatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Please enter your current password.'),
    password: z.string().min(8, 'The password must be at least 8 characters.'),
    passwordConfirmation: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirmation, {
    message: 'The password confirmation does not match.',
    path: ['passwordConfirmation'],
  });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(255),
  email: z.string().trim().min(1, 'Please enter your email.').email().max(255),
});

/**
 * Super Admin bootstrap. The password rule matches the Laravel form's
 * Password::defaults() with the strength requirements the tests assert.
 */
export const createSuperAdminSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    email: z.string().trim().email().max(255),
    password: z
      .string()
      .min(12, 'The password must be at least 12 characters.')
      .regex(/[a-z]/, 'The password must contain a lowercase letter.')
      .regex(/[A-Z]/, 'The password must contain an uppercase letter.')
      .regex(/[0-9]/, 'The password must contain a number.')
      .regex(/[^A-Za-z0-9]/, 'The password must contain a symbol.'),
    passwordConfirmation: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirmation, {
    message: 'The password confirmation does not match.',
    path: ['passwordConfirmation'],
  });

// --- Programs & curricula --------------------------------------------------

export const programSchema = z.object({
  code: z.string().trim().min(1, 'The code is required.').max(20),
  name: z.string().trim().min(1, 'The name is required.').max(255),
  description: nullableString(2000),
  isActive: z.boolean().default(true),
});

export const curriculumSchema = z.object({
  programId: idSchema,
  versionLabel: z.string().trim().min(1, 'The version label is required.').max(50),
  effectiveSchoolYear: z.string().trim().min(1, 'The school year is required.').max(20),
  isActive: z.boolean().default(true),
});

// --- Subjects --------------------------------------------------------------

export const subjectSchema = z.object({
  code: z.string().trim().min(1, 'The code is required.').max(20),
  title: z.string().trim().min(1, 'The title is required.').max(255),
  description: nullableString(2000),
  subjectType: subjectTypeSchema,
  defaultUnits: z.coerce.number().min(0, 'Units cannot be negative.').max(99, 'Units is too large.'),
  isActive: z.boolean().default(true),
});

export const curriculumSubjectSchema = z
  .object({
    curriculumId: idSchema,
    subjectId: idSchema,
    prerequisiteSubjectId: idSchema.nullable().optional(),
    yearLevel: z.coerce.number().int().min(1).max(4),
    semester: z.coerce.number().int().min(1).max(2),
    units: z.coerce.number().min(0).max(99),
  })
  // Laravel rule: different:subject_id
  .refine((d) => !d.prerequisiteSubjectId || d.prerequisiteSubjectId !== d.subjectId, {
    message: 'The prerequisite must be a different subject.',
    path: ['prerequisiteSubjectId'],
  });

// --- Students --------------------------------------------------------------

export const studentSchema = z.object({
  firstName: z.string().trim().min(1, 'The first name is required.').max(100),
  middleName: nullableString(100),
  lastName: z.string().trim().min(1, 'The last name is required.').max(100),
  email: nullableEmail,
  phone: nullableString(30),
  dateOfBirth: nullableDate,
  programId: idSchema,
  curriculumId: idSchema,
  yearLevel: z.coerce.number().int().min(1).max(4),
  status: studentStatusSchema,
  enrollmentDate: nullableDate,
});

// --- Applications ----------------------------------------------------------

export const applicationSchema = z.object({
  firstName: z.string().trim().min(1, 'The first name is required.').max(100),
  middleName: nullableString(100),
  lastName: z.string().trim().min(1, 'The last name is required.').max(100),
  email: nullableEmail,
  phone: nullableString(30),
  dateOfBirth: nullableDate,
  programId: idSchema,
  status: applicationStatusSchema.default('submitted'),
  notes: nullableString(2000),
});

export const returnApplicationSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required when returning an application.').max(500),
});

// --- Credentials -----------------------------------------------------------

export const verifyCredentialSchema = z.object({
  remarks: nullableString(2000),
});

export const rejectCredentialSchema = z.object({
  reason: z.string().trim().min(1, 'A rejection reason is required.').max(500),
});

export const credentialRequirementSchema = z.object({
  programId: idSchema.nullable().optional(),
  name: z.string().trim().min(1, 'The name is required.').max(255),
  isRequired: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

// --- Enrollment ------------------------------------------------------------

export const enrollmentSchema = z.object({
  studentId: idSchema,
  curriculumId: idSchema,
  // Laravel rule: regex:/^\d{4}-\d{4}$/
  schoolYear: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, 'Use the format 2025-2026.'),
  semester: z.coerce.number().int().min(1).max(2),
  yearLevel: z.coerce.number().int().min(1).max(4),
});

export const enrollmentTransitionSchema = z.object({
  status: enrollmentStatusSchema,
  reason: nullableString(500),
});

// --- Staff accounts --------------------------------------------------------

/**
 * Roles a staff account may be given. `student` is excluded because student
 * accounts are created through enrolment, not the Staff screen — the same
 * restriction the Laravel component enforced.
 */
export const staffRoleSchema = z.enum(
  ROLES.filter((r) => r !== 'student') as unknown as [string, ...string[]],
);

export const staffSchema = z.object({
  name: z.string().trim().min(1, 'The name is required.').max(255),
  email: z.string().trim().min(1, 'The email is required.').email().max(255),
  role: staffRoleSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ProgramInput = z.infer<typeof programSchema>;
export type SubjectInput = z.infer<typeof subjectSchema>;
export type StudentInput = z.infer<typeof studentSchema>;
export type ApplicationInput = z.infer<typeof applicationSchema>;
export type StaffInput = z.infer<typeof staffSchema>;

/** Flatten Zod issues into the { field: [messages] } shape the UI renders. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
