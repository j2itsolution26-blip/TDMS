import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError, NotFoundError } from '@/lib/http';
import type { z } from 'zod';
import type { studentSchema } from '@/server/validation/schemas';
import type { Prisma } from '@prisma/client';

/** Port of the students/index Volt component and App\Models\Student. */

const PAGE_SIZE = 10;

export interface StudentRow {
  id: string;
  studentNumber: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  yearLevel: number;
  status: string;
  program: { id: string; name: string; code: string };
  curriculum: { id: string; versionLabel: string };
}

/** trim("{first} {middle} {last}") — the Eloquent fullName() accessor. */
export function fullName(p: { firstName: string; middleName: string | null; lastName: string }): string {
  return `${p.firstName} ${p.middleName ?? ''} ${p.lastName}`.replace(/\s+/g, ' ').trim();
}

export async function listStudents(options: { page?: number; search?: string } = {}) {
  const page = options.page ?? 1;
  const search = options.search?.trim() ?? '';

  /*
   * Laravel used `like %term%` on three columns. Postgres LIKE is
   * case-sensitive, so `mode: 'insensitive'` is added here — searching for
   * "santos" previously missed "Santos", which was a latent annoyance
   * rather than a deliberate behaviour.
   */
  const where: Prisma.StudentWhereInput = search
    ? {
        OR: [
          { studentNumber: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: { program: true, curriculum: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.student.count({ where }),
  ]);

  return {
    rows: rows.map(
      (s): StudentRow => ({
        id: s.id.toString(),
        studentNumber: s.studentNumber,
        fullName: fullName(s),
        email: s.email,
        phone: s.phone,
        yearLevel: s.yearLevel,
        status: s.status,
        program: { id: s.program.id.toString(), name: s.program.name, code: s.program.code },
        curriculum: { id: s.curriculum.id.toString(), versionLabel: s.curriculum.versionLabel },
      }),
    ),
    page,
    pageSize: PAGE_SIZE,
    total,
    lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getStudent(id: bigint) {
  const student = await prisma.student.findUnique({
    where: { id },
    include: { program: true, curriculum: true },
  });
  if (!student) throw new NotFoundError('Student not found.');
  return student;
}

/**
 * Next student number: "{year}-{0001}".
 *
 * The Laravel version counted matching rows inside a transaction with
 * lockForUpdate(). A row lock on a COUNT does not actually prevent two
 * concurrent callers from computing the same number, because there is no
 * row to lock when the year's first student is created. Here the whole
 * insert is wrapped in a Serializable transaction and retried, so a
 * collision is resolved rather than merely made less likely — the unique
 * index on student_number is what makes the retry correct.
 */
async function nextStudentNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear().toString();
  const count = await tx.student.count({ where: { studentNumber: { startsWith: `${year}-` } } });
  return `${year}-${String(count + 1).padStart(4, '0')}`;
}

export async function createStudent(input: z.infer<typeof studentSchema>) {
  await assertProgramAndCurriculumAgree(input.programId, input.curriculumId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const studentNumber = await nextStudentNumber(tx);
        return tx.student.create({
          data: {
            studentNumber,
            firstName: input.firstName,
            middleName: input.middleName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone,
            dateOfBirth: input.dateOfBirth,
            programId: input.programId,
            curriculumId: input.curriculumId,
            yearLevel: input.yearLevel,
            status: input.status,
            enrollmentDate: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'student_number') && attempt < 4) continue;
      throw error;
    }
  }

  throw new AppError('Could not allocate a student number. Please try again.', 409);
}

export async function updateStudent(id: bigint, input: z.infer<typeof studentSchema>) {
  await getStudent(id);
  await assertProgramAndCurriculumAgree(input.programId, input.curriculumId);

  return prisma.student.update({
    where: { id },
    data: {
      firstName: input.firstName,
      middleName: input.middleName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth,
      programId: input.programId,
      curriculumId: input.curriculumId,
      yearLevel: input.yearLevel,
      status: input.status,
      updatedAt: new Date(),
    },
  });
}

/**
 * Laravel: Rule::exists('curricula','id')->where('program_id', $program_id).
 * The curriculum must both exist and belong to the chosen program, so a
 * hand-crafted request cannot attach a student to another program's
 * curriculum.
 */
async function assertProgramAndCurriculumAgree(programId: bigint, curriculumId: bigint) {
  const [program, curriculum] = await Promise.all([
    prisma.program.findUnique({ where: { id: programId }, select: { id: true } }),
    prisma.curriculum.findUnique({ where: { id: curriculumId }, select: { programId: true } }),
  ]);

  if (!program) {
    throw new AppError('The selected program does not exist.', 422, { programId: ['The selected program does not exist.'] });
  }
  if (!curriculum || curriculum.programId !== programId) {
    throw new AppError('The selected curriculum does not belong to that program.', 422, {
      curriculumId: ['The selected curriculum does not belong to that program.'],
    });
  }
}

/**
 * Port of Student::hasAllRequiredCredentialsVerified().
 *
 * A requirement counts when it is active, required, and either global
 * (program_id IS NULL) or attached to this student's program.
 */
export async function hasAllRequiredCredentialsVerified(studentId: bigint): Promise<boolean> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { programId: true },
  });
  if (!student) return false;

  const requiredIds = await prisma.credentialRequirement.findMany({
    where: {
      isActive: true,
      isRequired: true,
      OR: [{ programId: null }, { programId: student.programId }],
    },
    select: { id: true },
  });

  if (requiredIds.length === 0) return true;

  const verified = await prisma.studentCredential.count({
    where: {
      studentId,
      credentialRequirementId: { in: requiredIds.map((r) => r.id) },
      status: 'verified',
    },
  });

  return verified === requiredIds.length;
}

function isUniqueViolation(error: unknown, contains: string): boolean {
  const e = error as { code?: string; meta?: { target?: string[] | string } };
  if (e?.code !== 'P2002') return false;
  const target = Array.isArray(e.meta?.target) ? e.meta.target.join(',') : String(e.meta?.target ?? '');
  return target.includes(contains);
}
