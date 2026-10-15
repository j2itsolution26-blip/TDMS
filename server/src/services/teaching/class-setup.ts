import type { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError, NotFoundError } from '@/server/lib/http';
import { DAY_SHORT, formatClock, sectionCapacity, sectionLabel, SECTION_CAPACITY, SEMESTER_LABELS, yearLevelLabel } from '@shared/lib/teaching';
import type { AuthUser } from '@shared/types/domain';
import { USER_MODEL_TYPE } from '@/server/auth/rbac';
import { actorLabel, recordAudit, type AuditContext } from '@/server/services/audit-log';
import type { classCheckSchema, classSchema, classUpdateSchema, sectionSchema } from '@/server/schemas/teaching';
import { assertNoConflicts, previewConflicts } from './schedule-conflicts';
import { notifyStudents, notifyUsers } from './notifications';
import { assertWritableYear } from './school-years';
import { studentCredentialPolicy, studentPolicy } from '@/server/auth/policies';

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
  const [sections, classes, programs, subjects, instructorRows, rooms, curricula] = await Promise.all([
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
        roomId: true,
        status: true,
        curriculumSubjectId: true,
        roomRef: { select: { code: true } },
        instructor: { select: { name: true } },
        subject: { select: { id: true, code: true, title: true } },
        section: { select: { id: true, name: true, yearLevel: true, program: { select: { id: true, code: true } } } },
        schedules: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }], select: { dayOfWeek: true, startTime: true, endTime: true, room: true, roomId: true, roomRef: { select: { code: true } } } },
      },
    }),
    prisma.program.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, title: true } }),
    prisma.modelHasRole.findMany({
      where: { modelType: USER_MODEL_TYPE, role: { name: 'teacher', guardName: 'web' } },
      select: { modelId: true },
    }),
    prisma.room.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, type: true, capacity: true, isActive: true } }),
    // Each active program's current curriculum (newest active), for the subjects a section can be scheduled.
    prisma.curriculum.findMany({
      where: { isActive: true, program: { isActive: true } },
      orderBy: { effectiveSchoolYear: 'desc' },
      select: { id: true, programId: true, versionLabel: true, curriculumSubjects: { select: { subjectId: true, yearLevel: true, semester: true, units: true, isRequired: true } } },
    }),
  ]);
  const current = new Map<string, (typeof curricula)[number]>();
  for (const c of curricula) if (!current.has(c.programId.toString())) current.set(c.programId.toString(), c);

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
      label: sectionLabel(s.program.code, s.yearLevel, s.name),
      program: { id: s.program.id.toString(), code: s.program.code, name: s.program.name },
      students: s._count.students,
      classes: s._count.classes,
    })),
    classes: classes.map((c) => ({
      id: c.id.toString(),
      semester: c.semester,
      room: c.room,
      roomId: c.roomId?.toString() ?? null,
      roomCode: c.roomRef?.code ?? null,
      status: c.status,
      /** Linked to its curriculum entry (false only for classes created before mapping checks). */
      mapped: c.curriculumSubjectId !== null,
      passingGrade: c.passingGrade.toNumber(),
      gradeStatus: c.gradeStatus,
      instructorId: c.instructorId?.toString() ?? null,
      instructorName: c.instructor?.name ?? null,
      subject: { id: c.subject.id.toString(), code: c.subject.code, title: c.subject.title },
      section: { id: c.section.id.toString(), label: sectionLabel(c.section.program.code, c.section.yearLevel, c.section.name), programId: c.section.program.id.toString(), yearLevel: c.section.yearLevel },
      schedules: c.schedules.map((m) => ({ dayOfWeek: m.dayOfWeek, startTime: m.startTime, endTime: m.endTime, room: m.room, roomId: m.roomId?.toString() ?? null, roomCode: m.roomRef?.code ?? null })),
      scheduleText: c.schedules.map((s) => `${DAY_SHORT[s.dayOfWeek]} ${formatClock(s.startTime)}–${formatClock(s.endTime)}`).join(', '),
    })),
    programs: programs.map((p) => ({ id: p.id.toString(), code: p.code, name: p.name })),
    subjects: subjects.map((s) => ({ id: s.id.toString(), code: s.code, title: s.title })),
    instructors: instructors.map((u) => ({ id: u.id.toString(), name: u.name, email: u.email })),
    rooms: rooms.map((r) => ({ id: r.id.toString(), code: r.code, name: r.name, type: r.type, capacity: r.capacity, isActive: r.isActive })),
    /** What each program's current curriculum offers, by year level and semester. */
    mappings: [...current.values()].flatMap((c) => c.curriculumSubjects.map((e) => ({
      programId: c.programId.toString(),
      curriculum: c.versionLabel,
      subjectId: e.subjectId.toString(),
      yearLevel: e.yearLevel,
      semester: e.semester,
      units: e.units.toNumber(),
      isRequired: e.isRequired,
    }))),
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
    target: `${sectionLabel(program.code, input.yearLevel, input.name)} (${year.label})`,
    context,
  });
  return section;
}

export async function renameSection(user: AuthUser, id: bigint, name: string, context?: AuditContext) {
  const section = await prisma.section.findUnique({ where: { id }, include: { schoolYear: true } });
  if (!section) throw new NotFoundError('Section not found.');
  assertWritableYear(section.schoolYear);
  // Names are unique per program, year level and school year (sections_unique).
  const clash = await prisma.section.findFirst({
    where: { schoolYearId: section.schoolYearId, programId: section.programId, yearLevel: section.yearLevel, name, id: { not: id } },
    select: { id: true },
  });
  if (clash) throw new AppError('That section already exists.', 422, { name: ['That section already exists for this program and year level.'] });
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

/** Who may join a section: a student of its program who is still studying. */
const ROSTER_STATUSES = ['active', 'applicant'];

export async function sectionRoster(id: bigint) {
  const section = await prisma.section.findUnique({
    where: { id },
    select: {
      id: true, schoolYearId: true, programId: true, yearLevel: true, name: true,
      program: { select: { code: true, name: true } },
      schoolYear: { select: { label: true, status: true } },
    },
  });
  if (!section) throw new NotFoundError('Section not found.');

  const [members, candidates, elsewhere] = await Promise.all([
    prisma.sectionStudent.findMany({
      where: { sectionId: id },
      select: { student: { select: { id: true, studentNumber: true, firstName: true, lastName: true, status: true, yearLevel: true } } },
    }),
    // Students of the section's program not yet in any section this year.
    prisma.student.findMany({
      where: {
        programId: section.programId,
        status: { in: ROSTER_STATUSES },
        sectionMemberships: { none: { schoolYearId: section.schoolYearId } },
      },
      orderBy: [{ yearLevel: 'asc' }, { lastName: 'asc' }],
      take: 300,
      select: { id: true, studentNumber: true, firstName: true, lastName: true, yearLevel: true, status: true },
    }),
    // Students of this program already placed in another section this year — not offered, but counted, so the screen can say why.
    prisma.sectionStudent.count({
      where: { schoolYearId: section.schoolYearId, sectionId: { not: id }, student: { programId: section.programId, status: { in: ROSTER_STATUSES } } },
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
    section: {
      id: section.id.toString(),
      label: sectionLabel(section.program.code, section.yearLevel, section.name),
      yearLevel: section.yearLevel,
      name: section.name,
      program: { code: section.program.code, name: section.program.name },
      schoolYear: section.schoolYear.label,
      archived: section.schoolYear.status === 'ARCHIVED',
    },
    members: members.map((m) => shape(m.student)).sort((a, b) => a.name.localeCompare(b.name)),
    candidates: candidates.map(shape),
    assignedElsewhere: elsewhere,
    capacity: sectionCapacity(members.length),
  };
}

/**
 * Add students to a section. Every rule is checked here, whatever the screen
 * offered:
 *
 *   * each student must exist, belong to the section's program and still be
 *     studying (active or applicant) — otherwise nothing is added (422);
 *   * one section per student per school year (unique index): a student
 *     already in this section is left as is, and one in another section is
 *     never moved — they are reported back by name and section, so the office
 *     can remove them there first;
 *   * the count reported is what the database actually inserted, so two
 *     simultaneous requests cannot both claim the same students;
 *   * a section holds at most SECTION_CAPACITY students. The section row is
 *     locked (SELECT … FOR UPDATE) for the rest of the transaction before its
 *     members are counted, so additions to one section run one after another
 *     and each sees the others' students — two Admins cannot overfill it.
 *     Asking for more than the free slots refuses the whole request (409
 *     SECTION_CAPACITY) rather than adding some and dropping the rest; a
 *     section already over the limit accepts nobody until it is brought down.
 */
export async function addSectionStudents(user: AuthUser, id: bigint, studentIds: bigint[], context?: AuditContext) {
  const section = await prisma.section.findUnique({
    where: { id },
    include: { schoolYear: true, program: { select: { code: true } }, classes: { select: { instructorId: true, subject: { select: { title: true } } } } },
  });
  if (!section) throw new NotFoundError('Section not found.');
  assertWritableYear(section.schoolYear);

  const unique = [...new Set(studentIds.map(String))].map(BigInt);
  const students = await prisma.student.findMany({
    where: { id: { in: unique } },
    select: { id: true, studentNumber: true, firstName: true, lastName: true, programId: true, status: true },
  });
  if (students.length !== unique.length) throw new AppError('One or more students were not found.', 422);
  const ineligible = students.filter((s) => s.programId !== section.programId || !ROSTER_STATUSES.includes(s.status));
  if (ineligible.length > 0) {
    const names = ineligible.map((s) => `${s.studentNumber} (${s.firstName} ${s.lastName})`).join(', ');
    throw new AppError(`Only active students of ${section.program.code} can join this section: ${names}.`, 422, { studentIds: [`Not eligible: ${names}`] });
  }

  const label = sectionLabel(section.program.code, section.yearLevel, section.name);
  const { added, conflicts, already } = await prisma.$transaction(async (tx) => {
    // Serialise every addition to this section, then count with the lock held.
    await tx.$queryRaw`SELECT id FROM sections WHERE id = ${id} FOR UPDATE`;
    const current = await tx.sectionStudent.count({ where: { sectionId: id } });

    const placed = await tx.sectionStudent.findMany({
      where: { schoolYearId: section.schoolYearId, studentId: { in: unique } },
      select: { studentId: true, sectionId: true, section: { select: { name: true, yearLevel: true, program: { select: { code: true } } } } },
    });
    const placedIds = new Set(placed.map((p) => p.studentId.toString()));
    const toAdd = unique.filter((sid) => !placedIds.has(sid.toString()));

    const cap = sectionCapacity(current);
    if (toAdd.length > cap.available) {
      const why = cap.over
        ? `${label} already has ${current} students, more than its limit of ${SECTION_CAPACITY}. Remove students before adding more.`
        : cap.available === 0
          ? `${label} is full (${SECTION_CAPACITY} of ${SECTION_CAPACITY} students).`
          : `${label} has ${cap.available} slot${cap.available === 1 ? '' : 's'} left (${current} of ${SECTION_CAPACITY}); you selected ${toAdd.length}. Select at most ${cap.available}.`;
      throw new AppError(why, 409, { studentIds: [why] }, 'SECTION_CAPACITY');
    }
    const result = await tx.sectionStudent.createMany({
      data: toAdd.map((studentId) => ({ sectionId: id, studentId, schoolYearId: section.schoolYearId })),
      skipDuplicates: true,
    });
    // "New student enrollment in assigned class" — for each instructor of the section.
    const instructorIds = section.classes.map((c) => c.instructorId).filter((x): x is bigint => x !== null);
    if (result.count > 0) {
      await notifyUsers(tx, instructorIds, {
        type: 'class.students-added',
        title: `${result.count} student${result.count === 1 ? '' : 's'} added to ${label}`,
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
    const who = (sid: bigint) => students.find((s) => s.id === sid)!;
    return {
      added: result.count,
      already: placed.filter((p) => p.sectionId === id).length,
      conflicts: placed
        .filter((p) => p.sectionId !== id)
        .map((p) => {
          const s = who(p.studentId);
          return { studentNumber: s.studentNumber, name: `${s.lastName}, ${s.firstName}`, section: sectionLabel(p.section.program.code, p.section.yearLevel, p.section.name) };
        }),
    };
  });

  await recordAudit({
    action: 'SECTION_STUDENTS_ADDED',
    actor: actorLabel(user),
    target: `${label} (${section.schoolYear.label})`,
    details: { added, alreadyInThisSection: already, inAnotherSection: conflicts.length },
    context,
  });
  return { added, skipped: already + conflicts.length, already, conflicts };
}

/**
 * One student of a section, for the roster's Student Information panel.
 *
 * Opened by whoever manages the roster (manageClasses), and only for a
 * student who is in this section — anyone else is a 404, so the endpoint
 * cannot be used to look students up. What it returns follows the existing
 * policies rather than widening them:
 *
 *   * placement and academic details (program, curriculum, year level,
 *     section, school year, enrollment) — everyone who may open the roster;
 *   * personal details and the login account's status — only roles that may
 *     read student records (studentPolicy.view: Admin, Director, Secretary);
 *   * documents — only roles that may view student documents.
 *
 * Restricted parts are left out and named in `restricted`. Never returned:
 * passwords, tokens, the QR token or document files.
 */
export async function sectionStudentProfile(user: AuthUser, sectionId: bigint, studentId: bigint) {
  const membership = await prisma.sectionStudent.findFirst({
    where: { sectionId, studentId },
    select: {
      createdAt: true,
      section: { select: { name: true, yearLevel: true, program: { select: { code: true } }, schoolYear: { select: { label: true, currentSemester: true } } } },
    },
  });
  if (!membership) throw new NotFoundError('That student is not in this section.');

  const canRecords = studentPolicy.view(user);
  const canDocuments = studentCredentialPolicy.viewAny(user);
  const yearLabel = membership.section.schoolYear.label;

  const [student, enrollments, credentials] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true, studentNumber: true, firstName: true, middleName: true, lastName: true, email: true, phone: true,
        dateOfBirth: true, yearLevel: true, status: true, enrollmentDate: true,
        program: { select: { code: true, name: true } },
        curriculum: { select: { versionLabel: true, effectiveSchoolYear: true } },
        user: { select: { email: true, status: true, mustChangePassword: true, createdAt: true, lastLoginAt: true } },
      },
    }),
    prisma.enrollment.findMany({
      where: { studentId },
      orderBy: [{ schoolYear: 'desc' }, { semester: 'desc' }],
      take: 6,
      select: { schoolYear: true, semester: true, yearLevel: true, status: true, approvedAt: true, approver: { select: { name: true } } },
    }),
    canDocuments
      ? prisma.studentCredential.findMany({
          where: { studentId },
          select: { status: true, version: true, submittedAt: true, verifiedAt: true, requirement: { select: { name: true, isRequired: true } }, verifier: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);
  if (!student) throw new NotFoundError('Student not found.');

  const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
  const thisYear = enrollments.find((e) => e.schoolYear === yearLabel) ?? null;
  const restricted: ('personal' | 'documents' | 'account')[] = [];
  if (!canRecords) restricted.push('personal', 'account');
  if (!canDocuments) restricted.push('documents');

  return {
    id: student.id.toString(),
    studentNumber: student.studentNumber,
    name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' '),
    status: student.status,
    program: student.program,
    curriculum: student.curriculum ? { version: student.curriculum.versionLabel, effective: student.curriculum.effectiveSchoolYear } : null,
    yearLevel: student.yearLevel,
    section: { label: sectionLabel(membership.section.program.code, membership.section.yearLevel, membership.section.name), schoolYear: yearLabel, currentSemester: membership.section.schoolYear.currentSemester, placedAt: iso(membership.createdAt) },
    enrollment: thisYear ? { schoolYear: thisYear.schoolYear, semester: thisYear.semester, yearLevel: thisYear.yearLevel, status: thisYear.status, approvedAt: iso(thisYear.approvedAt), approvedBy: thisYear.approver?.name ?? null } : null,
    enrollmentHistory: enrollments.map((e) => ({ schoolYear: e.schoolYear, semester: e.semester, yearLevel: e.yearLevel, status: e.status })),
    personal: canRecords
      ? { firstName: student.firstName, middleName: student.middleName, lastName: student.lastName, dateOfBirth: student.dateOfBirth ? student.dateOfBirth.toISOString().slice(0, 10) : null, email: student.email, phone: student.phone, enrollmentDate: student.enrollmentDate ? student.enrollmentDate.toISOString().slice(0, 10) : null }
      : null,
    documents: canDocuments
      ? credentials
          .map((c) => ({ name: c.requirement.name, required: c.requirement.isRequired, status: c.status, version: c.version, submittedAt: iso(c.submittedAt), verifiedAt: iso(c.verifiedAt), verifiedBy: c.verifier?.name ?? null }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : null,
    account: canRecords
      ? student.user
        ? { exists: true as const, email: student.user.email, status: student.user.status, passwordChangeRequired: student.user.mustChangePassword, createdAt: iso(student.user.createdAt), lastSignIn: iso(student.user.lastLoginAt) }
        : { exists: false as const }
      : null,
    restricted,
  };
}
export type SectionStudentProfile = Awaited<ReturnType<typeof sectionStudentProfile>>;

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

/**
 * The curriculum entry a class teaches: the subject must be mapped in the
 * section's program's current curriculum (its newest active one, as for
 * enrollment) at the section's year level and the class's semester.
 */
async function requireCurriculumEntry(
  section: { programId: bigint; yearLevel: number; program: { code: string } },
  subject: { id: bigint; code: string },
  semester: number,
) {
  const curriculum = await prisma.curriculum.findFirst({
    where: { programId: section.programId, isActive: true },
    orderBy: { effectiveSchoolYear: 'desc' },
    select: { id: true, versionLabel: true },
  });
  if (!curriculum) {
    const text = `${section.program.code} has no active curriculum yet. Set one up under Programs, then map its subjects.`;
    throw new AppError(text, 422, { subjectId: [text] }, 'SUBJECT_NOT_MAPPED');
  }
  const entry = await prisma.curriculumSubject.findFirst({
    where: { curriculumId: curriculum.id, subjectId: subject.id, yearLevel: section.yearLevel, semester },
    select: { id: true },
  });
  if (!entry) {
    const text = `${subject.code} is not in ${section.program.code}'s curriculum (${curriculum.versionLabel}) for ${yearLevelLabel(section.yearLevel)} · ${SEMESTER_LABELS[semester] ?? `Semester ${semester}`}. Map it under Subjects first.`;
    throw new AppError(text, 422, { subjectId: [text] }, 'SUBJECT_NOT_MAPPED');
  }
  return entry;
}

/** Every room named on a class or its meetings must exist and be active. */
async function requireActiveRooms(ids: (bigint | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is bigint => x != null).map(String))].map(BigInt);
  if (unique.length === 0) return new Map<string, { id: bigint; code: string }>();
  const rooms = await prisma.room.findMany({ where: { id: { in: unique } }, select: { id: true, code: true, isActive: true } });
  if (rooms.length !== unique.length) throw new AppError('Choose a room from the list.', 422, { roomId: ['Choose a room from the list.'] });
  const inactive = rooms.filter((r) => !r.isActive);
  if (inactive.length) {
    const text = `Room ${inactive.map((r) => r.code).join(', ')} is inactive and cannot be scheduled.`;
    throw new AppError(text, 422, { roomId: [text] });
  }
  return new Map(rooms.map((r) => [r.id.toString(), r]));
}

/**
 * Create a class: the subject must be in the section's curriculum for that
 * year level and semester, the instructor and rooms active, and no meeting
 * may clash with another class's room, instructor or section time
 * (schedule-conflicts) — checked inside the transaction, under the term lock.
 */
export async function createClass(user: AuthUser, input: z.output<typeof classSchema>, context?: AuditContext) {
  const section = await prisma.section.findUnique({
    where: { id: input.sectionId },
    include: { schoolYear: true, program: { select: { code: true } } },
  });
  if (!section) throw new AppError('Choose a section.', 422, { sectionId: ['Choose a section.'] });
  assertWritableYear(section.schoolYear);

  const subject = await prisma.subject.findUnique({ where: { id: input.subjectId }, select: { id: true, code: true, title: true, isActive: true } });
  if (!subject?.isActive) throw new AppError('Choose an active subject.', 422, { subjectId: ['Choose an active subject.'] });

  const clash = await prisma.classOffering.findFirst({ where: { sectionId: input.sectionId, subjectId: input.subjectId, semester: input.semester } });
  if (clash) throw new AppError('This section already has that subject this semester.', 422, { subjectId: ['Already offered to this section this semester.'] });

  const entry = await requireCurriculumEntry(section, subject, input.semester);
  const instructor = input.instructorId ? await requireInstructorAccount(input.instructorId) : null;
  const rooms = await requireActiveRooms([input.roomId, ...input.schedules.map((s) => s.roomId)]);
  // The room's code is mirrored into the legacy text columns, which the
  // Instructor's screens show; the room id is what conflicts are checked on.
  const code = (id: bigint | null | undefined, text: string | null | undefined) => (id ? rooms.get(id.toString())?.code ?? null : text ?? null);
  const label = `${subject.title} — ${sectionLabel(section.program.code, section.yearLevel, section.name)}`;

  const cls = await prisma.$transaction(async (tx) => {
    await assertNoConflicts(tx, {
      schoolYearId: section.schoolYearId,
      semester: input.semester,
      sectionId: section.id,
      instructorId: instructor?.id ?? null,
      instructorName: instructor?.name,
      roomId: input.roomId ?? null,
      meetings: input.schedules,
    });
    const created = await tx.classOffering.create({
      data: {
        schoolYearId: section.schoolYearId,
        semester: input.semester,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        curriculumSubjectId: entry.id,
        instructorId: instructor?.id ?? null,
        room: code(input.roomId, input.room),
        roomId: input.roomId ?? null,
        passingGrade: input.passingGrade,
        schedules: { create: input.schedules.map((s) => ({ ...s, roomId: s.roomId ?? null, room: code(s.roomId, s.room) })) },
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
  }, { maxWait: 10_000, timeout: 20_000 });

  await recordAudit({
    action: 'CLASS_CREATED',
    actor: actorLabel(user),
    target: `Class ${label} (${section.schoolYear.label})`,
    details: { instructor: instructor?.name ?? null, meetings: input.schedules.length },
    context,
  });
  return cls;
}

/**
 * Update a class's instructor, rooms, meetings, passing grade or status. An
 * ACTIVE class is re-checked for conflicts like a new one; cancelling frees
 * its room, instructor and section time. A class created before curriculum
 * checks is linked to its curriculum entry when one matches, never refused.
 */
export async function updateClass(user: AuthUser, id: bigint, input: z.output<typeof classUpdateSchema>, context?: AuditContext) {
  const cls = await prisma.classOffering.findUnique({
    where: { id },
    include: {
      schoolYear: true,
      subject: { select: { id: true, code: true, title: true } },
      section: { select: { id: true, name: true, yearLevel: true, programId: true, program: { select: { code: true } } } },
    },
  });
  if (!cls) throw new NotFoundError('Class not found.');
  assertWritableYear(cls.schoolYear);

  const active = input.status === 'ACTIVE';
  const instructor = input.instructorId ? await requireInstructorAccount(input.instructorId) : null;
  const roomIds = [input.roomId, ...input.schedules.map((s) => s.roomId)];
  // A cancelled class may keep a room that has since been deactivated.
  const rooms = active
    ? await requireActiveRooms(roomIds)
    : new Map((await prisma.room.findMany({ where: { id: { in: roomIds.filter((x): x is bigint => x != null) } }, select: { id: true, code: true } })).map((r) => [r.id.toString(), r]));
  const code = (id: bigint | null | undefined, text: string | null | undefined) => (id ? rooms.get(id.toString())?.code ?? null : text ?? null);
  const changedInstructor = (instructor?.id ?? null)?.toString() !== cls.instructorId?.toString();
  const label = `${cls.subject.title} — ${sectionLabel(cls.section.program.code, cls.section.yearLevel, cls.section.name)}`;
  const entry = cls.curriculumSubjectId ?? (await requireCurriculumEntry(cls.section, cls.subject, cls.semester).then((e) => e.id).catch(() => null));

  await prisma.$transaction(async (tx) => {
    if (active) {
      await assertNoConflicts(tx, {
        schoolYearId: cls.schoolYearId,
        semester: cls.semester,
        classId: id,
        sectionId: cls.section.id,
        instructorId: instructor?.id ?? null,
        instructorName: instructor?.name,
        roomId: input.roomId ?? null,
        meetings: input.schedules,
      });
    }
    await tx.classOffering.update({
      where: { id },
      data: {
        instructorId: instructor?.id ?? null,
        room: code(input.roomId, input.room),
        roomId: input.roomId ?? null,
        passingGrade: input.passingGrade,
        status: input.status,
        curriculumSubjectId: entry,
      },
    });
    await tx.classSchedule.deleteMany({ where: { classId: id } });
    if (input.schedules.length > 0) {
      await tx.classSchedule.createMany({ data: input.schedules.map((s) => ({ ...s, roomId: s.roomId ?? null, room: code(s.roomId, s.room), classId: id })) });
    }
    if (changedInstructor && instructor && active) {
      await notifyUsers(tx, [instructor.id], {
        type: 'class.assigned',
        title: `You were assigned to teach ${label}`,
        body: `School year ${cls.schoolYear.label}.`,
        href: `/teaching/classes/${id}`,
      });
    }
  }, { maxWait: 10_000, timeout: 20_000 });

  await recordAudit({
    action: 'CLASS_UPDATED',
    actor: actorLabel(user),
    target: `Class ${label} (${cls.schoolYear.label})`,
    details: {
      ...(changedInstructor ? { instructor: instructor?.name ?? 'unassigned' } : {}),
      ...(input.status !== cls.status ? { status: input.status } : {}),
    },
    context,
  });
}

/**
 * The schedule form's dry run: the conflicts a class with these meetings
 * would have, without writing anything. For a new class pass the section and
 * semester; for an existing one its id.
 */
export async function checkClassSchedule(input: z.output<typeof classCheckSchema>) {
  let base: { schoolYearId: bigint; semester: number; sectionId: bigint; classId: bigint | null };
  if (input.classId) {
    const cls = await prisma.classOffering.findUnique({ where: { id: input.classId }, select: { id: true, schoolYearId: true, semester: true, sectionId: true } });
    if (!cls) throw new NotFoundError('Class not found.');
    base = { schoolYearId: cls.schoolYearId, semester: cls.semester, sectionId: cls.sectionId, classId: cls.id };
  } else {
    if (!input.sectionId || !input.semester) throw new AppError('Choose a section and a semester.', 422);
    const section = await prisma.section.findUnique({ where: { id: input.sectionId }, select: { id: true, schoolYearId: true } });
    if (!section) throw new NotFoundError('Section not found.');
    base = { schoolYearId: section.schoolYearId, semester: input.semester, sectionId: section.id, classId: null };
  }
  const instructor = input.instructorId ? await prisma.user.findUnique({ where: { id: input.instructorId }, select: { name: true } }) : null;
  const conflicts = await previewConflicts({
    ...base,
    instructorId: input.instructorId ?? null,
    instructorName: instructor?.name,
    roomId: input.roomId ?? null,
    meetings: input.schedules,
  });
  return { conflicts };
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
