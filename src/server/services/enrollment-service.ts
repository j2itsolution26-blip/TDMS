import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError, NotFoundError } from '@/lib/http';
import type { z } from 'zod';
import type { enrollmentSchema } from '@/server/validation/schemas';
import { hasAllRequiredCredentialsVerified } from './student-service';

/**
 * Enrolment and credential verification.
 *
 * Port of enrollment/show, App\Models\Enrollment and
 * App\Models\StudentCredential.
 */

// --- Credentials -----------------------------------------------------------

export async function listStudentCredentials(studentId: bigint) {
  const rows = await prisma.studentCredential.findMany({
    where: { studentId },
    include: { requirement: true, verifier: true, submitter: true },
  });

  // Laravel sorted in PHP by requirement name after fetching.
  rows.sort((a, b) => a.requirement.name.localeCompare(b.requirement.name));

  return rows.map((c) => ({
    id: c.id.toString(),
    status: c.status,
    version: c.version,
    remarks: c.remarks,
    rejectionReason: c.rejectionReason,
    filePath: c.filePath,
    submittedAt: c.submittedAt?.toISOString() ?? null,
    verifiedAt: c.verifiedAt?.toISOString() ?? null,
    requirement: {
      id: c.requirement.id.toString(),
      name: c.requirement.name,
      isRequired: c.requirement.isRequired,
    },
    verifier: c.verifier ? { name: c.verifier.name } : null,
  }));
}

export async function getCredential(id: bigint) {
  const credential = await prisma.studentCredential.findUnique({ where: { id } });
  if (!credential) throw new NotFoundError('Credential not found.');
  return credential;
}

/** Port of StudentCredential::verify(). */
export async function verifyCredential(id: bigint, actorId: bigint, remarks: string | null) {
  await getCredential(id);
  return prisma.studentCredential.update({
    where: { id },
    data: {
      status: 'verified',
      verifiedBy: actorId,
      verifiedAt: new Date(),
      remarks,
      rejectionReason: null,
      updatedAt: new Date(),
    },
  });
}

/** Port of StudentCredential::reject(). */
export async function rejectCredential(id: bigint, actorId: bigint, reason: string) {
  await getCredential(id);
  return prisma.studentCredential.update({
    where: { id },
    data: {
      status: 'rejected',
      verifiedBy: actorId,
      verifiedAt: new Date(),
      rejectionReason: reason,
      updatedAt: new Date(),
    },
  });
}

/**
 * Port of StudentCredential::submitNewVersion().
 *
 * Re-submitting clears the previous verification outcome and bumps the
 * version, so a rejected document cannot silently keep its old verdict.
 */
export async function submitCredentialVersion(id: bigint, actorId: bigint, filePath: string) {
  const credential = await getCredential(id);
  return prisma.studentCredential.update({
    where: { id },
    data: {
      filePath,
      submittedBy: actorId,
      submittedAt: new Date(),
      status: 'submitted',
      version: credential.version + 1,
      verifiedBy: null,
      verifiedAt: null,
      rejectionReason: null,
      updatedAt: new Date(),
    },
  });
}

/** A verified credential is locked against replacement. */
export function isCredentialLocked(status: string): boolean {
  return status === 'verified';
}

// --- Enrollments -----------------------------------------------------------

export async function listEnrollments(studentId: bigint) {
  const rows = await prisma.enrollment.findMany({
    where: { studentId },
    include: { approver: true },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((e) => ({
    id: e.id.toString(),
    schoolYear: e.schoolYear,
    semester: e.semester,
    yearLevel: e.yearLevel,
    status: e.status,
    approvedAt: e.approvedAt?.toISOString() ?? null,
    approver: e.approver ? { name: e.approver.name } : null,
  }));
}

export async function createEnrollment(input: z.infer<typeof enrollmentSchema>) {
  // The composite unique index is (student_id, school_year, semester).
  const clash = await prisma.enrollment.findFirst({
    where: { studentId: input.studentId, schoolYear: input.schoolYear, semester: input.semester },
    select: { id: true },
  });
  if (clash) {
    throw new AppError('This student already has an enrollment for that term.', 422, {
      schoolYear: ['This student already has an enrollment for that term.'],
    });
  }

  return prisma.enrollment.create({
    data: {
      studentId: input.studentId,
      curriculumId: input.curriculumId,
      schoolYear: input.schoolYear,
      semester: input.semester,
      yearLevel: input.yearLevel,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

/**
 * Port of Enrollment::transitionTo().
 *
 * The credential gate is checked BEFORE the transaction opens, exactly as
 * Laravel did, so a student with outstanding paperwork cannot be marked
 * enrolled. Moving to `enrolled` also stamps the approver and flips the
 * student to `active`; every transition is appended to the history table.
 */
export async function transitionEnrollment(
  id: bigint,
  toStatus: string,
  actorId: bigint,
  reason: string | null = null,
) {
  const enrollment = await prisma.enrollment.findUnique({ where: { id } });
  if (!enrollment) throw new NotFoundError('Enrollment not found.');

  if (toStatus === 'enrolled') {
    const ready = await hasAllRequiredCredentialsVerified(enrollment.studentId);
    if (!ready) {
      throw new AppError('This student still has unverified or missing required credentials.', 422);
    }
  }

  await prisma.$transaction(async (tx) => {
    const from = enrollment.status;

    await tx.enrollment.update({
      where: { id },
      data: {
        status: toStatus,
        approvedBy: toStatus === 'enrolled' ? actorId : enrollment.approvedBy,
        approvedAt: toStatus === 'enrolled' ? new Date() : enrollment.approvedAt,
        updatedAt: new Date(),
      },
    });

    await tx.enrollmentStatusHistory.create({
      data: {
        enrollmentId: id,
        fromStatus: from,
        toStatus,
        changedBy: actorId,
        reason,
      },
    });

    if (toStatus === 'enrolled') {
      await tx.student.update({
        where: { id: enrollment.studentId },
        data: { status: 'active', updatedAt: new Date() },
      });
    }
  });
}

/**
 * Default school year, as the Volt component's mount() computed it: the
 * academic year rolls over in June.
 */
export function defaultSchoolYear(now = new Date()): string {
  const year = now.getFullYear();
  return now.getMonth() + 1 >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}
