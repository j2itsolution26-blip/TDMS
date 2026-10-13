import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { AuthorizationError, NotFoundError } from '@/server/lib/http';
import { yearLevelLabel } from '@shared/lib/teaching';
import { studentPortalPolicy, teachingPolicy } from '@/server/auth/policies';
import type { AuthUser } from '@shared/types/domain';
import { assertWritableYear } from './school-years';

/**
 * The Instructor's boundary: "Instructor must only access students/classes/
 * subjects assigned to that instructor."
 *
 * Every Instructor service starts here. requireInstructorClass() proves, on
 * the server, for this request:
 *
 *   1. the caller is a Diploma Instructor (the role gate);
 *   2. the class exists and its instructor_id is the caller — otherwise 404,
 *      not 403, so class ids cannot be probed for existence;
 *   3. for a write, the class's school year is not archived.
 *
 * Students are reached only through a class: requireRosterStudent() proves
 * the student is on that class's section roster. There is no Instructor query
 * that takes a bare student id.
 */

export const CLASS_INCLUDE = {
  schoolYear: true,
  subject: { select: { id: true, code: true, title: true } },
  section: { select: { id: true, name: true, yearLevel: true, program: { select: { id: true, code: true, name: true } } } },
  schedules: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
} satisfies Prisma.ClassOfferingInclude;

export type TeachingClass = Prisma.ClassOfferingGetPayload<{ include: typeof CLASS_INCLUDE }>;

export function requireInstructor(user: AuthUser): void {
  if (!teachingPolicy.teach(user)) throw new AuthorizationError();
}

export async function requireInstructorClass(
  user: AuthUser,
  classId: bigint,
  options: { write?: boolean } = {},
): Promise<TeachingClass> {
  requireInstructor(user);
  const cls = await prisma.classOffering.findFirst({
    where: { id: classId, instructorId: BigInt(user.id) },
    include: CLASS_INCLUDE,
  });
  if (!cls) throw new NotFoundError('Class not found.');
  if (options.write) assertWritableYear(cls.schoolYear);
  return cls;
}

/** The section roster, ordered by name. */
export async function classRoster(sectionId: bigint) {
  const rows = await prisma.sectionStudent.findMany({
    where: { sectionId },
    select: {
      student: {
        select: {
          id: true,
          userId: true,
          studentNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          status: true,
          yearLevel: true,
          program: { select: { code: true, name: true } },
        },
      },
    },
  });
  return rows
    .map((r) => r.student)
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}

export type RosterStudent = Awaited<ReturnType<typeof classRoster>>[number];

export async function requireRosterStudent(cls: { sectionId: bigint }, studentId: bigint) {
  const row = await prisma.sectionStudent.findFirst({
    where: { sectionId: cls.sectionId, studentId },
    select: { student: { select: { id: true, userId: true, studentNumber: true, firstName: true, lastName: true, status: true } } },
  });
  if (!row) throw new NotFoundError('That student is not in this class.');
  return row.student;
}

export { studentName, classHeading } from '@shared/lib/teaching-labels';

/** The Instructor's classes in a school year (the active one by default). */
export async function instructorClasses(user: AuthUser, schoolYearId: bigint | null) {
  requireInstructor(user);
  if (schoolYearId === null) return [];
  return prisma.classOffering.findMany({
    where: { instructorId: BigInt(user.id), schoolYearId },
    include: CLASS_INCLUDE,
    orderBy: [{ semester: 'asc' }, { subject: { title: 'asc' } }],
  });
}

// --- Students ------------------------------------------------------------------------

/** A signed-in student's own record. Found by their own user id, never by input. */
export async function requireStudentRecord(user: AuthUser) {
  if (!studentPortalPolicy.use(user)) throw new AuthorizationError();
  const student = await prisma.student.findFirst({
    where: { userId: BigInt(user.id) },
    select: { id: true, studentNumber: true, firstName: true, lastName: true, middleName: true, qrToken: true, status: true, yearLevel: true, program: { select: { code: true, name: true } } },
  });
  if (!student) throw new NotFoundError('Your account is not linked to a student record yet.');
  return student;
}
