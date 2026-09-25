import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError, NotFoundError } from '@/lib/http';
import type { z } from 'zod';
import type { applicationSchema } from '@/server/validation/schemas';
import { fullName } from './student-service';
import type { Prisma } from '@prisma/client';

/** Port of applications/index and App\Models\Application. */

const PAGE_SIZE = 10;

export async function listApplications(options: { page?: number; status?: string } = {}) {
  const page = options.page ?? 1;
  const where: Prisma.ApplicationWhereInput = options.status ? { status: options.status } : {};

  const [rows, total] = await Promise.all([
    prisma.application.findMany({
      where,
      include: { program: true, student: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.application.count({ where }),
  ]);

  return {
    rows: rows.map((a) => ({
      id: a.id.toString(),
      fullName: fullName(a),
      email: a.email,
      phone: a.phone,
      status: a.status,
      notes: a.notes,
      createdAt: a.createdAt?.toISOString() ?? null,
      program: { id: a.program.id.toString(), name: a.program.name, code: a.program.code },
      student: a.student ? { id: a.student.id.toString(), studentNumber: a.student.studentNumber } : null,
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
    lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getApplication(id: bigint) {
  const application = await prisma.application.findUnique({ where: { id } });
  if (!application) throw new NotFoundError('Application not found.');
  return application;
}

export async function createApplication(input: z.infer<typeof applicationSchema>) {
  const program = await prisma.program.findUnique({ where: { id: input.programId }, select: { id: true } });
  if (!program) {
    throw new AppError('The selected program does not exist.', 422, { programId: ['The selected program does not exist.'] });
  }

  return prisma.application.create({
    data: {
      firstName: input.firstName,
      middleName: input.middleName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth,
      programId: input.programId,
      // The Laravel component forced this regardless of the submitted value.
      status: 'submitted',
      notes: input.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

export interface ApproveResult {
  studentId: string;
  studentNumber: string;
}

/**
 * Port of Application::approve().
 *
 * One transaction that: picks the program's newest active curriculum,
 * creates the Student as an `applicant`, opens a `missing` credential row
 * for every requirement that applies, and stamps the application approved.
 * If any step fails the whole thing rolls back, so an approved application
 * can never point at a half-built student.
 */
export async function approveApplication(id: bigint, actorId: bigint): Promise<ApproveResult> {
  return prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({ where: { id } });
    if (!application) throw new NotFoundError('Application not found.');

    const curriculum = await tx.curriculum.findFirst({
      where: { programId: application.programId, isActive: true },
      orderBy: { effectiveSchoolYear: 'desc' },
      select: { id: true },
    });

    // The Laravel version threw RuntimeException with this exact wording.
    if (!curriculum) {
      throw new AppError('This program has no active curriculum to enroll into.', 422);
    }

    const year = new Date().getFullYear().toString();
    const count = await tx.student.count({ where: { studentNumber: { startsWith: `${year}-` } } });
    const studentNumber = `${year}-${String(count + 1).padStart(4, '0')}`;

    const student = await tx.student.create({
      data: {
        studentNumber,
        firstName: application.firstName,
        middleName: application.middleName,
        lastName: application.lastName,
        email: application.email,
        phone: application.phone,
        dateOfBirth: application.dateOfBirth,
        programId: application.programId,
        curriculumId: curriculum.id,
        yearLevel: 1,
        status: 'applicant',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const requirements = await tx.credentialRequirement.findMany({
      where: {
        isActive: true,
        OR: [{ programId: null }, { programId: application.programId }],
      },
      select: { id: true },
    });

    if (requirements.length > 0) {
      await tx.studentCredential.createMany({
        data: requirements.map((r) => ({
          studentId: student.id,
          credentialRequirementId: r.id,
          status: 'missing',
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });
    }

    await tx.application.update({
      where: { id },
      data: {
        status: 'approved',
        studentId: student.id,
        reviewedBy: actorId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return { studentId: student.id.toString(), studentNumber: student.studentNumber };
  });
}

/** Port of Application::returnToApplicant(). */
export async function returnApplication(id: bigint, reason: string, actorId: bigint) {
  await getApplication(id);
  return prisma.application.update({
    where: { id },
    data: {
      status: 'returned',
      notes: reason,
      reviewedBy: actorId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    },
  });
}
