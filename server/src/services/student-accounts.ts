import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { AppError, NotFoundError } from '@/server/lib/http';
import { hashPassword } from '@/server/auth/password';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import { consumeRateLimit } from '@/server/auth/rate-limit';
import { checkInstitutionalEmail } from '@/server/lib/institutional-email';
import { generateTemporaryPassword } from '@shared/lib/temporary-password';
import type { AuthUser } from '@shared/types/domain';
import { recordAudit, actorLabel, type AuditContext } from './audit-log';

/**
 * Student login accounts, created by the Admin for students whose enrollment
 * has been approved.
 *
 * Approval and account creation stay separate steps. Every rule is checked
 * here, so it holds for direct API calls:
 *
 *   * the student exists and has an enrollment that is Enrolled — pending,
 *     rejected and dropped ones do not count;
 *   * the student has no login yet, and the address is not already in use;
 *   * the login, its `student` role and the link to the student record are
 *     written in one transaction. The link is a conditional update on
 *     `user_id IS NULL`, backed by the unique index on students.user_id, so
 *     two Admins clicking at once cannot both succeed — the loser's login is
 *     rolled back.
 *
 * The temporary password is generated here, stored only as a hash, shown to
 * the Admin once in the response, and must be changed at first sign-in — the
 * same rules as staff accounts.
 */

export type StudentAccountState = 'NONE' | 'ACTIVE' | 'PASSWORD_CHANGE' | 'SUSPENDED' | 'INACTIVE' | 'PENDING';

export const STUDENT_ACCOUNT_STATE_LABELS: Record<StudentAccountState, string> = {
  NONE: 'Account Not Created',
  ACTIVE: 'Account Active',
  PASSWORD_CHANGE: 'Password Change Required',
  SUSPENDED: 'Account Suspended',
  INACTIVE: 'Account Inactive',
  PENDING: 'Account Pending',
};

function accountState(user: { status: string; mustChangePassword: boolean } | null): StudentAccountState {
  if (!user) return 'NONE';
  if (user.status === 'SUSPENDED') return 'SUSPENDED';
  if (user.status === 'INACTIVE') return 'INACTIVE';
  if (user.status === 'PENDING') return 'PENDING';
  return user.mustChangePassword ? 'PASSWORD_CHANGE' : 'ACTIVE';
}

const PAGE = 20;

export interface StudentAccountFilters {
  programId?: bigint;
  schoolYear?: string;
  semester?: number;
  yearLevel?: number;
  account?: StudentAccountState;
  search?: string;
  page: number;
}

/** Students with an Enrolled enrollment (matching the term filters), and where their login stands. */
export async function listStudentAccounts(f: StudentAccountFilters) {
  const enrolled: Prisma.EnrollmentWhereInput = {
    status: 'enrolled',
    ...(f.schoolYear ? { schoolYear: f.schoolYear } : {}),
    ...(f.semester ? { semester: f.semester } : {}),
  };
  const where: Prisma.StudentWhereInput = {
    enrollments: { some: enrolled },
    ...(f.programId ? { programId: f.programId } : {}),
    ...(f.yearLevel ? { yearLevel: f.yearLevel } : {}),
    ...(f.search
      ? { OR: [{ studentNumber: { contains: f.search, mode: 'insensitive' } }, { firstName: { contains: f.search, mode: 'insensitive' } }, { lastName: { contains: f.search, mode: 'insensitive' } }] }
      : {}),
  };
  if (f.account === 'NONE') where.userId = null;
  else if (f.account === 'PASSWORD_CHANGE') where.user = { status: 'ACTIVE', mustChangePassword: true };
  else if (f.account === 'ACTIVE') where.user = { status: 'ACTIVE', mustChangePassword: false };
  else if (f.account) where.user = { status: f.account };

  const [total, rows, all] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: (f.page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true,
        studentNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        yearLevel: true,
        program: { select: { code: true, name: true } },
        enrollments: { where: enrolled, orderBy: [{ schoolYear: 'desc' }, { semester: 'desc' }], take: 1, select: { schoolYear: true, semester: true } },
        user: { select: { id: true, email: true, status: true, mustChangePassword: true, lastLoginAt: true, createdAt: true } },
      },
    }),
    // Counts per account state across every enrolled student, for the filter chips.
    prisma.student.findMany({ where: { enrollments: { some: { status: 'enrolled' } } }, select: { user: { select: { status: true, mustChangePassword: true } } } }),
  ]);

  const counts: Record<StudentAccountState, number> = { NONE: 0, ACTIVE: 0, PASSWORD_CHANGE: 0, SUSPENDED: 0, INACTIVE: 0, PENDING: 0 };
  for (const s of all) counts[accountState(s.user)] += 1;

  return {
    rows: rows.map((s) => {
      const state = accountState(s.user);
      return {
        id: s.id.toString(),
        studentNumber: s.studentNumber,
        name: `${s.firstName} ${s.lastName}`,
        email: s.email,
        yearLevel: s.yearLevel,
        program: s.program,
        term: s.enrollments[0] ? `SY ${s.enrollments[0].schoolYear} · Semester ${s.enrollments[0].semester}` : null,
        enrollment: s.enrollments[0] ? { schoolYear: s.enrollments[0].schoolYear, semester: s.enrollments[0].semester, status: 'enrolled' as const } : null,
        account: s.user
          ? { id: s.user.id.toString(), email: s.user.email, lastLoginAt: s.user.lastLoginAt?.toISOString() ?? null, createdAt: s.user.createdAt?.toISOString() ?? null }
          : null,
        state,
        stateLabel: STUDENT_ACCOUNT_STATE_LABELS[state],
      };
    }),
    counts,
    total,
    page: f.page,
    lastPage: Math.max(1, Math.ceil(total / PAGE)),
  };
}

const CREATE_LIMIT_PER_ACTOR = { max: 60, windowSeconds: 3600 };

export interface CreatedStudentAccount {
  studentId: string;
  userId: string;
  email: string;
  /** Plaintext, in this response only. The account stores a hash. */
  temporaryPassword: string;
}

export async function createStudentAccount(actor: AuthUser, studentId: bigint, rawEmail: string | null, context: AuditContext): Promise<CreatedStudentAccount> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, studentNumber: true, firstName: true, lastName: true, email: true, userId: true, enrollments: { where: { status: 'enrolled' }, select: { id: true }, take: 1 } },
  });
  if (!student) throw new NotFoundError('That student does not exist.');
  if (student.userId !== null) {
    throw new AppError('This student already has a login account.', 409, undefined, 'ACCOUNT_ALREADY_EXISTS');
  }
  if (student.enrollments.length === 0) {
    throw new AppError('A login account can be created only after the student’s enrollment is approved (Enrolled).', 409, undefined, 'STUDENT_NOT_ENROLLED');
  }

  const throttle = await consumeRateLimit('student-account-create', actor.id, CREATE_LIMIT_PER_ACTOR);
  if (throttle.limited) throw new AppError('Many accounts have been created recently. Please wait a while.', 429);

  const address = (rawEmail?.trim() || student.email?.trim() || '');
  if (!address) throw new AppError('Enter the student’s email address for signing in.', 422, { email: ['Enter an email address.'] });
  const check = checkInstitutionalEmail(address);
  if (!check.ok) throw new AppError(check.message!, 422, { email: [check.message!] });
  if (await prisma.user.findUnique({ where: { email: check.email }, select: { id: true } })) {
    throw new AppError('An account already exists for that email address.', 422, { email: ['An account already exists for that email address.'] });
  }

  const role = await prisma.role.findFirst({ where: { name: 'student', guardName: GUARD }, select: { id: true } });
  if (!role) throw new AppError('The student role does not exist.', 500);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  let userId: bigint;
  try {
    userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: `${student.firstName} ${student.lastName}`,
          email: check.email,
          password: passwordHash,
          // Confirmed on the Admin's authority, as for staff accounts; recorded in the audit entry.
          emailVerifiedAt: new Date(),
          mustChangePassword: true,
          status: 'ACTIVE',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        select: { id: true },
      });
      await tx.modelHasRole.create({ data: { roleId: role.id, modelType: USER_MODEL_TYPE, modelId: user.id } });
      const linked = await tx.student.updateMany({ where: { id: student.id, userId: null }, data: { userId: user.id, updatedAt: new Date() } });
      if (linked.count !== 1) throw new AppError('This student already has a login account.', 409, undefined, 'ACCOUNT_ALREADY_EXISTS');
      return user.id;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const field = String((error.meta?.target as string[] | string | undefined) ?? '');
      if (field.includes('email')) throw new AppError('An account already exists for that email address.', 422, { email: ['An account already exists for that email address.'] });
      throw new AppError('This student already has a login account.', 409, undefined, 'ACCOUNT_ALREADY_EXISTS');
    }
    throw error;
  }

  await recordAudit({
    action: 'STUDENT_ACCOUNT_CREATED',
    actor: actorLabel(actor),
    target: `${student.firstName} ${student.lastName} <${check.email}> (${student.studentNumber})`,
    // That a temporary password was issued; never what it was.
    details: { student_number: student.studentNumber, role: 'student', status: 'ACTIVE', email_confirmation: 'administrative', must_change_password: true },
    context,
  });

  return { studentId: student.id.toString(), userId: userId.toString(), email: check.email, temporaryPassword };
}
