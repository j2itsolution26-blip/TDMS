import type { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError, NotFoundError } from '@/server/lib/http';
import { DAY_SHORT, formatClock, yearLevelLabel } from '@shared/lib/teaching';
import type { AuthUser } from '@shared/types/domain';
import { USER_MODEL_TYPE } from '@/server/auth/rbac';
import { actorLabel, recordAudit, type AuditContext } from '@/server/services/audit-log';
import type { classSchema, classUpdateSchema, sectionSchema } from '@/server/schemas/teaching';
import { notifyStudents, notifyUsers } from './notifications';
import { assertWritableYear } from './school-years';

/**
 * Class setup — the Admin's and Coordinator's side of the module.
 *
 *   section   a program's year level, named, in one school year
 *   roster    which students are in it (one section per student per year)
 *   class     a subject taught to a section in a semester, with its
 *             Diploma Instructor and weekly schedule
 *
 * The instructor assignment made here is what every Instructor permission
 * hangs off. Everything is scoped to a school year and refused when that year
 * is archived.
 */

async function writableYear(id: bigint) {
  const year = await prisma.schoolYear.findUnique({ where: { id } });
  if (!year) throw new NotFoundError('School year not found.');
  assertWritableYear(year);
  return year;
}

async function requireInstructorAccount(id: bigint) {
  const row = await prisma.modelHasRole.findFirst({
    where: { modelId: id, modelType: USER_MODEL_TYPE, role: { name: 'teacher', guardName: 'web' } },
    select: { modelId: true },
  });
  const user = row ? await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, status: true } }) : null;
  if (!user) throw new AppError('Choose a Diploma Instructor.', 422, { instructorId: ['Choose a Diploma Instructor.'] });
  if (user.status !== 'ACTIVE') throw new AppError('That Diploma Instructor account is not active.', 422, { instructorId: ['That account is not active.'] });
  return user;
}

/** Everything the Class Setup screen needs for one school year, in one round of queries. */
export async function classSetupOverview(schoolYearId: bigint) {
  const [sections, classes, programs, subjects, instructorRows] = await Promise.all([
    prisma.section.findMany({
      where: { schoolYearId },
      orderBy: [{ program: { code: 'asc' } }, { yearLevel: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        yearLevel: true,
        program: { select: { id: true, code: true, name: true } },
        _count: { select: { students: true, classes: true } },
      },
    }),
    prisma.classOffering.findMany({
      where: { schoolYearId },
      orderBy: [{ semester: 'asc' }, { section: { name: 'asc' } }, { subject: { code: 'asc' } }],
      select: {
        id: true,
        semester: true,
        room: true,
        passingGrade: true,
        gradeStatus: true,
        instructorId: true,
        instructor: { select: { name: true } },
        subject: { select: { id: true, code: true, title: true } },
        section: { select: { id: true, name: true, yearLevel: true, program: { select: { code: true } } } },
        schedules: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }], select: { dayOfWeek: true, startTime: true, endTime: true, room: true } },
      },
    }),
    prisma.program.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, title: true } }),
    prisma.modelHasRole.findMany({
      where: { modelType: USER_MODEL_TYPE, role: { name: 'teacher', guardName: 'web' } },
      select: { modelId: true },
    }),
  ]);

  const instructors = await prisma.user.findMany({
    where: { id: { in: instructorRows.map((r) => r.modelId) }, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true },
  });

  return {
    sections: sections.map((s) => ({
      id: s.id.toString(),
      name: s.name,
      yearLevel: s.yearLevel,
      label: `${s.program.code} ${yearLevelLabel(s.yearLevel)} · Section ${s.name}`,
      program: { id: s.program.id.toString(), code: s.program.code, name: s.program.name },
      students: s._count.students,
      classes: s._count.classes,
    })),
    classes: classes.map((c) => ({
      id: c.id.toString(),
      semester: c.semester,
      room: c.room,
      passingGrade: c.passingGrade.toNumber(),
      gradeStatus: c.gradeStatus,
      instructorId: c.instructorId?.toString() ?? null,
      instructorName: c.instructor?.name ?? null,
      subject: { id: c.subject.id.toString(), code: c.subject.code, title: c.subject.title },
      section: { id: c.section.id.toString(), label: `${c.section.program.code} ${c.section.yearLevel}-${c.section.name}` },
      schedules: c.schedules,
      scheduleText: c.schedules.map((s) => `${DAY_SHORT[s.dayOfWeek]} ${formatClock(s.startTime)}–${formatClock(s.endTime)}`).join(', '),
    })),
    programs: programs.map((p) => ({ id: p.id.toString(), code: p.code, name: p.name })),
    subjects: subjects.map((s) => ({ id: s.id.toString(), code: s.code, title: s.title })),
    instructors: instructors.map((u) => ({ id: u.id.toString(), name: u.name, email: u.email })),
  };
}

// --- Sections ----------------------------------------------------------------------

export async function createSection(user: AuthUser, input: z.output<typeof sectionSchema>, context?: AuditContext) {
  const year = await writableYear(input.schoolYearId);
  const program = await prisma.program.findUnique({ where: { id: input.programId }, select: { code: true } });
  if (!program) throw new AppError('Choose a program.', 422, { programId: ['Choose a program.'] });

  const clash = await prisma.section.findFirst({
    where: { schoolYearId: input.schoolYearId, programId: input.programId, yearLevel: input.yearLevel, name: input.name },
  });
  if (clash) throw new AppError('That section already exists.', 422, { name: ['That section already exists for this program and year level.'] });

  const section = await prisma.section.create({ data: input });
  await recordAudit({
    action: 'SECTION_CREATED',
    actor: actorLabel(user),
    target: `Section ${program.code} ${input.yearLevel}-${input.name} (${year.label})`,
    context,
  });
  return section;
}

export async function renameSection(user: AuthUser, id: bigint, name: string, context?: AuditContext) {
  const section = await prisma.section.findUnique({ where: { id }, include: { schoolYear: true } });
  if (!section) throw new NotFoundError('Section not found.');
  assertWritableYear(section.schoolYear);
  const updated = await prisma.section.update({ where: { id }, data: { name } });
  await recordAudit({ action: 'SECTION_RENAMED', actor: actorLabel(user), target: `Section ${section.name}`, details: { to: name }, context });
  return updated;
}

/** Only an empty section — a section with classes or students carries history. */
export async function deleteSection(user: AuthUser, id: bigint, context?: AuditContext) {
  const section = await prisma.section.findUnique({
    where: { id },
    include: { schoolYear: true, _count: { select: { students: true, classes: true } } },
  });
  if (!section) throw new NotFoundError('Section not found.');
  assertWritableYear(section.schoolYear);
  if (section._count.students > 0 || section._count.classes > 0) {
    throw new AppError('Remove the students and classes from this section first.', 409);
  }
  await prisma.section.delete({ where: { id } });
  await recordAudit({ action: 'SECTION_DELETED', actor: actorLabel(user), target: `Section ${section.name}`, context });
}

export async function sectionRoster(id: bigint) {
  const section = await prisma.section.findUnique({
    where: { id },
    select: { id: true, schoolYearId: true, programId: true, yearLevel: true, name: true, program: { select: { code: true } } },
  });
  if (!section) throw new NotFoundError('Section not found.');

  const [members, candidates] = await Promise.all([
    prisma.sectionStudent.findMany({
      where: { sectionId: id },
      select: { student: { select: { id: true, studentNumber: true, firstName: true, lastName: true, status: true } } },
    }),
    // Students of the section's program not yet in any section this year.
    prisma.student.findMany({
      where: {
        programId: section.programId,
        status: { in: ['active', 'applicant'] },
        sectionMemberships: { none: { schoolYearId: section.schoolYearId } },
      },
      orderBy: [{ yearLevel: 'asc' }, { lastName: 'asc' }],
      take: 300,
      select: { id: true, studentNumber: true, firstName: true, lastName: true, yearLevel: true, status: true },
    }),
  ]);

  const shape = (s: { id: bigint; studentNumber: string; firstName: string; lastName: string; status: string; yearLevel?: number }) => ({
    id: s.id.toString(),
    studentNumber: s.studentNumber,
    name: `${s.lastName}, ${s.firstName}`,
    status: s.status,
    yearLevel: s.yearLevel ?? null,
  });

  return {
    section: { id: section.id.toString(), label: `${section.program.code} ${section.yearLevel}-${section.name}`, yearLevel: section.yearLevel },
    members: members.map((m) => shape(m.student)).sort((a, b) => a.name.localeCompare(b.name)),
    candidates: candidates.map(shape),
  };
}

export async function addSectionStudents(user: AuthUser, id: bigint, studentIds: bigint[], context?: AuditContext) {
  const section = await prisma.section.findUnique({
    where: { id },
    include: { schoolYear: true, program: { select: { code: true } }, classes: { select: { instructorId: true, subject: { select: { title: true } } } } },
  });
  if (!section) throw new NotFoundError('Section not found.');
  assertWritableYear(section.schoolYear);

  const students = await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true } });
  if (students.length !== studentIds.length) throw new AppError('One or more students were not found.', 422);

  const taken = await prisma.sectionStudent.findMany({
    where: { schoolYearId: section.schoolYearId, studentId: { in: studentIds } },
    select: { studentId: true },
  });
  const takenIds = new Set(taken.map((t) => t.studentId.toString()));
  const toAdd = studentIds.filter((sid) => !takenIds.has(sid.toString()));

  const label = `${section.program.code} ${section.yearLevel}-${section.name}`;
  await prisma.$transaction(async (tx) => {
    await tx.sectionStudent.createMany({
      data: toAdd.map((studentId) => ({ sectionId: id, studentId, schoolYearId: section.schoolYearId })),
      skipDuplicates: true,
    });
    // "New student enrollment in assigned class" — for each instructor of the section.
    const instructorIds = section.classes.map((c) => c.instructorId).filter((x): x is bigint => x !== null);
    if (toAdd.length > 0) {
      await notifyUsers(tx, instructorIds, {
        type: 'class.students-added',
        title: `${toAdd.length} student${toAdd.length === 1 ? '' : 's'} added to ${label}`,
        body: `Your class roster for section ${label} has changed.`,
        href: '/teaching/classes',
      });
      await notifyStudents(tx, toAdd, {
        type: 'section.assigned',
        title: `You were added to section ${label}`,
        body: `School year ${section.schoolYear.label}.`,
        href: '/dashboard',
      });
    }
  });

  await recordAudit({
    action: 'SECTION_STUDENTS_ADDED',
    actor: actorLabel(user),
    target: `Section ${label} (${section.schoolYear.label})`,
    details: { added: toAdd.length, alreadyInASection: takenIds.size },
    context,
  });
  return { added: toAdd.length, skipped: takenIds.size };
}

/** Removing a student keeps every attendance record and score they already have. */
export async function removeSectionStudent(user: AuthUser, id: bigint, studentId: bigint, context?: AuditContext) {
  const section = await prisma.section.findUnique({ where: { id }, include: { schoolYear: true } });
  if (!section) throw new NotFoundError('Section not found.');
  assertWritableYear(section.schoolYear);
  const removed = await prisma.sectionStudent.deleteMany({ where: { sectionId: id, studentId } });
  if (removed.count === 0) throw new NotFoundError('That student is not in this section.');
  await recordAudit({ action: 'SECTION_STUDENT_REMOVED', actor: actorLabel(user), target: `Section ${section.name}`, details: { studentId: studentId.toString() }, context });
}

// --- Classes -----------------------------------------------------------------------

export async function createClass(user: AuthUser, input: z.output<typeof classSchema>, context?: AuditContext) {
  const section = await prisma.section.findUnique({
    where: { id: input.sectionId },
    include: { schoolYear: true, program: { select: { code: true } } },
  });
  if (!section) throw new AppError('Choose a section.', 422, { sectionId: ['Choose a section.'] });
  assertWritableYear(section.schoolYear);

  const subject = await prisma.subject.findUnique({ where: { id: input.subjectId }, select: { title: true, isActive: true } });
  if (!subject?.isActive) throw new AppError('Choose an active subject.', 422, { subjectId: ['Choose an active subject.'] });

  const clash = await prisma.classOffering.findFirst({ where: { sectionId: input.sectionId, subjectId: input.subjectId, semester: input.semester } });
  if (clash) throw new AppError('This section already has that subject this semester.', 422, { subjectId: ['Already offered to this section this semester.'] });

  const instructor = input.instructorId ? await requireInstructorAccount(input.instructorId) : null;
  const label = `${subject.title} — ${section.program.code} ${section.yearLevel}-${section.name}`;

  const cls = await prisma.$transaction(async (tx) => {
    const created = await tx.classOffering.create({
      data: {
        schoolYearId: section.schoolYearId,
        semester: input.semester,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        instructorId: instructor?.id ?? null,
        room: input.room,
        passingGrade: input.passingGrade,
        schedules: { create: input.schedules },
      },
    });
    if (instructor) {
      await notifyUsers(tx, [instructor.id], {
        type: 'class.assigned',
        title: `You were assigned to teach ${label}`,
        body: `School year ${section.schoolYear.label}.`,
        href: `/teaching/classes/${created.id}`,
      });
    }
    return created;
  });

  await recordAudit({
    action: 'CLASS_CREATED',
    actor: actorLabel(user),
    target: `Class ${label} (${section.schoolYear.label})`,
    details: { instructor: instructor?.name ?? null },
    context,
  });
  return cls;
}

export async function updateClass(user: AuthUser, id: bigint, input: z.output<typeof classUpdateSchema>, context?: AuditContext) {
  const cls = await prisma.classOffering.findUnique({
    where: { id },
    include: { schoolYear: true, subject: { select: { title: true } }, section: { select: { name: true, yearLevel: true, program: { select: { code: true } } } } },
  });
  if (!cls) throw new NotFoundError('Class not found.');
  assertWritableYear(cls.schoolYear);

  const instructor = input.instructorId ? await requireInstructorAccount(input.instructorId) : null;
  const changedInstructor = (instructor?.id ?? null)?.toString() !== cls.instructorId?.toString();
  const label = `${cls.subject.title} — ${cls.section.program.code} ${cls.section.yearLevel}-${cls.section.name}`;

  await prisma.$transaction(async (tx) => {
    await tx.classOffering.update({
      where: { id },
      data: { instructorId: instructor?.id ?? null, room: input.room, passingGrade: input.passingGrade },
    });
    await tx.classSchedule.deleteMany({ where: { classId: id } });
    if (input.schedules.length > 0) await tx.classSchedule.createMany({ data: input.schedules.map((s) => ({ ...s, classId: id })) });
    if (changedInstructor && instructor) {
      await notifyUsers(tx, [instructor.id], {
        type: 'class.assigned',
        title: `You were assigned to teach ${label}`,
        body: `School year ${cls.schoolYear.label}.`,
        href: `/teaching/classes/${id}`,
      });
    }
  });

  await recordAudit({
    action: 'CLASS_UPDATED',
    actor: actorLabel(user),
    target: `Class ${label} (${cls.schoolYear.label})`,
    details: changedInstructor ? { instructor: instructor?.name ?? 'unassigned' } : undefined,
    context,
  });
}

/** Only a class with no recorded work: attendance, assessments, grades or documents. */
export async function deleteClass(user: AuthUser, id: bigint, context?: AuditContext) {
  const cls = await prisma.classOffering.findUnique({
    where: { id },
    include: {
      schoolYear: true,
      subject: { select: { title: true } },
      _count: { select: { attendanceSessions: true, assessments: true, grades: true, documents: true } },
    },
  });
  if (!cls) throw new NotFoundError('Class not found.');
  assertWritableYear(cls.schoolYear);
  const used = Object.values(cls._count).some((n) => n > 0);
  if (used) throw new AppError('This class already has attendance, assessments, grades or documents, so it cannot be deleted.', 409);
  await prisma.classOffering.delete({ where: { id } });
  await recordAudit({ action: 'CLASS_DELETED', actor: actorLabel(user), target: `Class ${cls.subject.title} (${cls.schoolYear.label})`, context });
}
