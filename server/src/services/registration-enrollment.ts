import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/http';
import { SEMESTER_LABELS } from '@shared/lib/teaching';

/**
 * The enrollment a newly registered student starts with.
 *
 * Registering a student (Students → New Student, or approving an application)
 * used to create only the student record, so the student never reached
 * Enrollments and could never be approved or placed in a section. Now the
 * registration opens a PENDING enrollment for a school term in the same
 * transaction: student and enrollment are created together, or neither.
 *
 * Pending, not enrolled: approving still needs every required document
 * verified (enrollment-service.transitionEnrollment), and a new student's
 * checklist starts empty. Approval — from Enrollments — is what places the
 * student in a section (teaching/section-assignment).
 */

export interface RegistrationTerm {
  schoolYearId: bigint;
  label: string;
  semester: number;
}

/**
 * The term to enroll a new student into: the one chosen, or else the active
 * school year's current semester. Null when nothing was chosen and no school
 * year is active — the student is then registered without an enrollment and
 * the caller says so.
 */
export async function registrationTerm(choice?: { schoolYearId: bigint; semester: number } | null): Promise<RegistrationTerm | null> {
  if (choice) {
    const year = await prisma.schoolYear.findUnique({ where: { id: choice.schoolYearId }, select: { id: true, label: true, status: true } });
    if (!year) throw new AppError('Choose a school year.', 422, { schoolYearId: ['Choose a school year.'] });
    if (year.status === 'ARCHIVED') {
      throw new AppError(`School year ${year.label} is archived and cannot take new enrollments.`, 422, { schoolYearId: ['This school year is archived.'] });
    }
    return { schoolYearId: year.id, label: year.label, semester: choice.semester };
  }
  const active = await prisma.schoolYear.findFirst({ where: { status: 'ACTIVE' }, orderBy: { startsOn: 'desc' }, select: { id: true, label: true, currentSemester: true } });
  return active ? { schoolYearId: active.id, label: active.label, semester: active.currentSemester } : null;
}

/** Open the pending enrollment, inside the registration's transaction. */
export async function openPendingEnrollment(
  tx: Prisma.TransactionClient,
  input: { studentId: bigint; curriculumId: bigint; yearLevel: number; term: RegistrationTerm },
) {
  const enrollment = await tx.enrollment.create({
    data: {
      studentId: input.studentId,
      curriculumId: input.curriculumId,
      schoolYear: input.term.label,
      schoolYearId: input.term.schoolYearId,
      semester: input.term.semester,
      yearLevel: input.yearLevel,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    select: { id: true },
  });
  await tx.enrollmentStatusHistory.create({
    data: { enrollmentId: enrollment.id, fromStatus: null, toStatus: 'pending', changedBy: null, reason: 'Opened at registration' },
  });
  return {
    id: enrollment.id.toString(),
    schoolYear: input.term.label,
    semester: input.term.semester,
    term: `SY ${input.term.label} · ${SEMESTER_LABELS[input.term.semester] ?? `Semester ${input.term.semester}`}`,
    status: 'pending' as const,
  };
}
