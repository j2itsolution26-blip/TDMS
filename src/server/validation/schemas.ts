import { z } from 'zod';
import {
  subjectTypeSchema,
  studentStatusSchema,
  applicationStatusSchema,
  enrollmentStatusSchema,
  accountStatusSchema,
  ROLES,
} from '@/types/domain';
import { checkInstitutionalEmail, allowedDomain } from '@/lib/institutional-email';
import { passwordProblems } from '@/lib/password-policy';

/**
 * Any address that will belong to a TDMS account goes through this, not
 * z.string().email(). It normalises (trim + lowercase) and enforces the
 * institutional domain server-side, rejecting lookalikes — see
 * src/lib/institutional-email.ts for the cases that matters for.
 */
const institutionalEmail = z
  .string()
  .transform((v) => v.trim())
  .superRefine((value, ctx) => {
    const check = checkInstitutionalEmail(value);
    if (!check.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: check.message! });
    }
  })
  .transform((v) => checkInstitutionalEmail(v).email);

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
  email: institutionalEmail,
});

/** A raw verification or reset token: 32 bytes, hex. */
export const tokenSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{64}$/, 'That link is not valid.');

export const verifyTokenSchema = z.object({ token: tokenSchema });

/**
 * Password strength, applied everywhere a password is chosen.
 *
 * Built from PASSWORD_REQUIREMENTS rather than restating the rules, so the
 * live checklist in the browser and this check cannot disagree — there is one
 * list, and both read it. Same requirements as before, same messages.
 *
 * Every requirement is reported at once, rather than stopping at the first
 * failure, because a form showing one problem at a time is how you get five
 * round trips to choose a password.
 */
export const strongPassword = z.string().superRefine((value, ctx) => {
  for (const message of passwordProblems(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }
});

export const resetPasswordSchema = z
  .object({
    token: tokenSchema,
    password: strongPassword,
    passwordConfirmation: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirmation, {
    message: 'The password confirmation does not match.',
    path: ['passwordConfirmation'],
  });

export const updatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Please enter your current password.'),
    password: strongPassword,
    passwordConfirmation: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirmation, {
    message: 'The password confirmation does not match.',
    path: ['passwordConfirmation'],
  });

/**
 * Replacing a Super Admin-issued temporary password — POST
 * /api/auth/change-password.
 *
 * Same rules as updatePasswordSchema, which the profile page uses, but its own
 * schema so the wording can speak to somebody on their first sign-in: they
 * know the field as "Temporary password", not "current password". The field
 * NAMES stay the project's existing ones.
 *
 * Every requirement the new password misses is reported, individually, under
 * the field — the same messages the live checklist is built from.
 */
export const changeTemporaryPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Temporary password is required.'),
    password: z.string().min(1, 'New password is required.').pipe(strongPassword),
    passwordConfirmation: z.string().min(1, 'Please confirm your new password.'),
  })
  .refine((d) => d.password === d.passwordConfirmation, {
    message: 'Passwords do not match.',
    path: ['passwordConfirmation'],
  });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(255),
  email: institutionalEmail,
});

/**
 * Super Admin bootstrap, step 1: the registration details.
 *
 * Identical rules to every other account in the system, with one difference
 * that is presentation only: the domain refusal is worded for somebody who is
 * registering rather than signing in. The check itself is the shared one, so
 * the domain restriction is honoured exactly as it is everywhere else —
 * enforced when GOOGLE_DOMAIN_RESTRICTION_ENABLED is on, and the lookalike
 * domains it rejects (see institutional-email.ts) are rejected here too.
 * Well-formedness is always required, restriction or not.
 *
 * Passing this schema creates nothing. It is the gate in front of sending a
 * verification code, and the account is created only after that code comes
 * back — see src/server/services/super-admin-service.ts.
 */
const registrationEmail = z
  .string()
  .transform((v) => v.trim())
  .superRefine((value, ctx) => {
    const check = checkInstitutionalEmail(value);
    if (check.ok) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      // An empty or over-long address keeps its own specific message; only
      // the "wrong domain" case is reworded.
      message:
        value.trim() === '' || value.trim().length > 255
          ? check.message!
          : `Please use your @${allowedDomain()} institutional email.`,
    });
  })
  .transform((v) => checkInstitutionalEmail(v).email);

export const superAdminRegistrationSchema = z
  .object({
    name: z.string().trim().min(1, 'Please enter your name.').max(255),
    email: registrationEmail,
    password: strongPassword,
    passwordConfirmation: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirmation, {
    message: 'Passwords do not match.',
    path: ['passwordConfirmation'],
  });

/**
 * Super Admin bootstrap, step 2: the emailed code.
 *
 * Six digits, nothing else. Spaces and dashes are stripped first so a pasted
 * "123 456" is not rejected for a formatting choice the sender made.
 */
export const verificationCodeSchema = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ''))
    .refine((v) => /^[0-9]{6}$/.test(v), {
      message: 'Enter the 6-digit code from your email.',
    }),
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
  /*
   * `student` is excluded because student accounts come from enrolment.
   *
   * `admin` and `super_admin` are excluded because privileged accounts are
   * not invited: an Admin is created by a Super Admin through Administration
   * → Admin Accounts, with a temporary password and an access code, and a
   * Super Admin exists only through first-time setup. The service layer
   * already refuses both (assignableRoles never returns them); saying so in
   * the schema means the refusal names the field instead of arriving as a
   * flat 403.
   */
  ROLES.filter((r) => !['student', 'admin', 'super_admin'].includes(r)) as unknown as [
    string,
    ...string[],
  ],
);

/**
 * A staff account's details: name, address, role. Used as-is for editing, and
 * extended with a temporary password for creation below.
 */
export const inviteAccountSchema = z.object({
  name: z.string().trim().min(1, 'The name is required.').max(255),
  email: institutionalEmail,
  role: staffRoleSchema,
});

/**
 * Creating a staff account: details plus a temporary password, which goes
 * through the same strength rule as every other password. It is temporary, not
 * exempt — a live credential from the moment the account exists.
 */
export const createStaffSchema = inviteAccountSchema
  .extend({
    temporaryPassword: strongPassword,
    temporaryPasswordConfirmation: z.string(),
  })
  .refine((d) => d.temporaryPassword === d.temporaryPasswordConfirmation, {
    message: 'The password confirmation does not match.',
    path: ['temporaryPasswordConfirmation'],
  });

export const accountStatusChangeSchema = z.object({
  status: accountStatusSchema.refine((s) => s !== 'PENDING', {
    message: 'An account cannot be put back into pending verification.',
  }),
});

// --- Administrator accounts and access codes -------------------------------

/*
 * No field here asks for the static Super Admin security code. The signed-in
 * Super Admin Dashboard is the trust boundary for these operations, and that
 * code is a separate server-only secret that is never typed into a form.
 */

/**
 * Creating an Admin account.
 *
 * The temporary password goes through the SAME `strongPassword` rule as any
 * other password in the system. It is temporary, not exempt: it is a live
 * credential from the moment it is created.
 */
export const createAdminSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter the administrator’s full name.').max(255),
    email: institutionalEmail,
    temporaryPassword: strongPassword,
    temporaryPasswordConfirmation: z.string(),
  })
  .refine((d) => d.temporaryPassword === d.temporaryPasswordConfirmation, {
    message: 'The password confirmation does not match.',
    path: ['temporaryPasswordConfirmation'],
  });

/**
 * Generating an access code from the dashboard: which Admin, for how long.
 *
 * The expiry is bounded here (1–60 minutes) and then snapped to one of the
 * offered options in the service, so a hand-made request cannot mint a
 * long-lived code.
 */
export const generateAccessCodeSchema = z.object({
  adminId: idSchema,
  expiresInMinutes: z.coerce
    .number()
    .int()
    .min(1, 'Choose how long the code should last.')
    .max(60, 'An access code can last at most an hour.')
    .optional(),
  /** Also email the code to them. Never the password. */
  emailAccessCode: z.boolean().default(false),
});

/**
 * Admin account status.
 *
 * Two values, and PENDING is not one of them. A Super Admin-created Admin is
 * ACTIVE from the moment it exists; there is no approval state to move it out
 * of, and offering one would reintroduce the workflow this replaced.
 */
export const adminStatusChangeSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

/**
 * The access code an Admin types at sign-in.
 *
 * Six digits, checked here so a malformed submission is a validation failure
 * rather than a wrong guess — it must not spend one of the account's limited
 * attempts against the real code.
 */
export const adminAccessCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'Enter the 6-digit access code.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ProgramInput = z.infer<typeof programSchema>;
export type SubjectInput = z.infer<typeof subjectSchema>;
export type StudentInput = z.infer<typeof studentSchema>;
export type ApplicationInput = z.infer<typeof applicationSchema>;
export type InviteAccountInput = z.infer<typeof inviteAccountSchema>;
export type CreateAdminInput = z.infer<typeof createAdminSchema>;

/** Flatten Zod issues into the { field: [messages] } shape the UI renders. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
