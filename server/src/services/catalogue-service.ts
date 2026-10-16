import { prisma } from '@/server/lib/prisma';
import { AppError, NotFoundError } from '@/server/lib/http';
import type { z } from 'zod';
import type {
  programSchema,
  subjectSchema,
  subjectPlacementSchema,
  curriculumSchema,
  curriculumSubjectSchema,
  curriculumSubjectUpdateSchema,
} from '@/server/schemas/schemas';
import type { Prisma } from '@prisma/client';
import { LOCKING_GRADE_STATUSES, normaliseHours } from '@shared/lib/subjects';

/**
 * Programs, curricula and subjects — the academic catalogue.
 *
 * Port of the Volt components programs/index, programs/show, subjects/index
 * and curricula/show. Uniqueness rules that Laravel expressed with
 * Rule::unique(...)->ignore(...) are re-checked here, because Zod cannot see
 * the database; the unique indexes remain the final backstop.
 */

const PAGE_SIZE = 10;

export interface Paginated<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  lastPage: number;
}

function paginate<T>(rows: T[], total: number, page: number): Paginated<T> {
  return {
    rows,
    page,
    pageSize: PAGE_SIZE,
    total,
    lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

// --- Programs --------------------------------------------------------------

export interface ProgramRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  curriculaCount: number;
}

export async function listPrograms(page = 1): Promise<Paginated<ProgramRow>> {
  const [rows, total] = await Promise.all([
    prisma.program.findMany({
      orderBy: { name: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { curricula: true } } },
    }),
    prisma.program.count(),
  ]);

  return paginate(
    rows.map((p) => ({
      id: p.id.toString(),
      code: p.code,
      name: p.name,
      description: p.description,
      isActive: p.isActive,
      curriculaCount: p._count.curricula,
    })),
    total,
    page,
  );
}

/** Active programs, for the <select> options on student/application forms. */
export async function activePrograms() {
  const rows = await prisma.program.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  });
  return rows.map((p) => ({ id: p.id.toString(), name: p.name, code: p.code }));
}

export async function getProgram(id: bigint) {
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) throw new NotFoundError('Program not found.');
  return program;
}

export async function createProgram(input: z.infer<typeof programSchema>) {
  await assertProgramCodeFree(input.code, null);
  return prisma.program.create({
    data: {
      code: input.code,
      name: input.name,
      description: input.description,
      isActive: input.isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

export async function updateProgram(id: bigint, input: z.infer<typeof programSchema>) {
  await getProgram(id);
  await assertProgramCodeFree(input.code, id);
  return prisma.program.update({
    where: { id },
    data: {
      code: input.code,
      name: input.name,
      description: input.description,
      isActive: input.isActive,
      updatedAt: new Date(),
    },
  });
}

export async function toggleProgramActive(id: bigint) {
  const program = await getProgram(id);
  return prisma.program.update({
    where: { id },
    data: { isActive: !program.isActive, updatedAt: new Date() },
  });
}

async function assertProgramCodeFree(code: string, ignoreId: bigint | null) {
  const clash = await prisma.program.findFirst({
    where: { code, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new AppError('That program code is already in use.', 422, { code: ['That program code is already in use.'] });
}

// --- Curricula -------------------------------------------------------------

export async function listCurriculaForProgram(programId: bigint) {
  const rows = await prisma.curriculum.findMany({
    where: { programId },
    orderBy: { effectiveSchoolYear: 'desc' },
    include: { _count: { select: { curriculumSubjects: true } } },
  });

  return rows.map((c) => ({
    id: c.id.toString(),
    versionLabel: c.versionLabel,
    effectiveSchoolYear: c.effectiveSchoolYear,
    isActive: c.isActive,
    subjectCount: c._count.curriculumSubjects,
  }));
}

export async function getCurriculum(id: bigint) {
  const curriculum = await prisma.curriculum.findUnique({
    where: { id },
    include: { program: true },
  });
  if (!curriculum) throw new NotFoundError('Curriculum not found.');
  return curriculum;
}

export async function createCurriculum(input: z.infer<typeof curriculumSchema>) {
  await assertVersionLabelFree(input.programId, input.versionLabel, null);
  return prisma.curriculum.create({
    data: {
      programId: input.programId,
      versionLabel: input.versionLabel,
      effectiveSchoolYear: input.effectiveSchoolYear,
      isActive: input.isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

export async function updateCurriculum(id: bigint, input: z.infer<typeof curriculumSchema>) {
  const existing = await getCurriculum(id);
  await assertVersionLabelFree(existing.programId, input.versionLabel, id);
  return prisma.curriculum.update({
    where: { id },
    data: {
      versionLabel: input.versionLabel,
      effectiveSchoolYear: input.effectiveSchoolYear,
      isActive: input.isActive,
      updatedAt: new Date(),
    },
  });
}

export async function toggleCurriculumActive(id: bigint) {
  const curriculum = await getCurriculum(id);
  return prisma.curriculum.update({
    where: { id },
    data: { isActive: !curriculum.isActive, updatedAt: new Date() },
  });
}

/** Unique per program, not globally — mirrors the composite unique index. */
async function assertVersionLabelFree(programId: bigint, versionLabel: string, ignoreId: bigint | null) {
  const clash = await prisma.curriculum.findFirst({
    where: { programId, versionLabel, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { id: true },
  });
  if (clash) {
    throw new AppError('That version label already exists for this program.', 422, {
      versionLabel: ['That version label already exists for this program.'],
    });
  }
}

/** Active curricula for one program — drives the dependent student select. */
export async function activeCurriculaForProgram(programId: bigint) {
  const rows = await prisma.curriculum.findMany({
    where: { programId, isActive: true },
    orderBy: { effectiveSchoolYear: 'desc' },
    select: { id: true, versionLabel: true, effectiveSchoolYear: true },
  });
  return rows.map((c) => ({
    id: c.id.toString(),
    versionLabel: c.versionLabel,
    effectiveSchoolYear: c.effectiveSchoolYear,
  }));
}

// --- Subjects --------------------------------------------------------------

export async function listSubjects(page = 1, search = '') {
  const q = search.trim();
  const where = q ? { OR: [{ code: { contains: q, mode: 'insensitive' as const } }, { title: { contains: q, mode: 'insensitive' as const } }] } : {};
  const [rows, total] = await Promise.all([
    prisma.subject.findMany({
      where,
      orderBy: { code: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      // Where each subject is used: its mapping status on the Subjects page.
      include: { curriculumSubjects: { select: { yearLevel: true, semester: true, curriculum: { select: { versionLabel: true, isActive: true, program: { select: { code: true } } } } } } },
    }),
    prisma.subject.count({ where }),
  ]);

  return paginate(
    rows.map((s) => ({
      id: s.id.toString(),
      code: s.code,
      title: s.title,
      description: s.description,
      subjectType: s.subjectType,
      defaultUnits: s.defaultUnits.toNumber(),
      lectureHours: s.lectureHours?.toNumber() ?? null,
      labHours: s.labHours?.toNumber() ?? null,
      recommendedClassSize: s.recommendedClassSize,
      remarks: s.remarks,
      isActive: s.isActive,
      usage: s.curriculumSubjects
        .filter((u) => u.curriculum.isActive)
        .map((u) => ({ program: u.curriculum.program.code, curriculum: u.curriculum.versionLabel, yearLevel: u.yearLevel, semester: u.semester })),
    })),
    total,
    page,
  );
}

/**
 * The Curriculum Map: each active program's current curriculum (its newest
 * active one — the one classes are scheduled from and students enroll into)
 * with every subject mapped to it, by year level and semester.
 */
export async function curriculumMap() {
  const [programs, curricula] = await Promise.all([
    prisma.program.findMany({ where: { isActive: true }, orderBy: { id: 'asc' }, select: { id: true, code: true, name: true } }),
    prisma.curriculum.findMany({
      where: { isActive: true },
      orderBy: { effectiveSchoolYear: 'desc' },
      select: {
        id: true, programId: true, versionLabel: true, effectiveSchoolYear: true,
        curriculumSubjects: {
          orderBy: [{ yearLevel: 'asc' }, { semester: 'asc' }],
          select: {
            id: true, yearLevel: true, semester: true, units: true, isRequired: true,
            subject: {
              select: {
                id: true, code: true, title: true, description: true, subjectType: true, defaultUnits: true,
                lectureHours: true, labHours: true, recommendedClassSize: true, remarks: true, isActive: true,
              },
            },
            prerequisites: { select: { subject: { select: { id: true, code: true } } } },
            _count: { select: { classes: true } },
          },
        },
      },
    }),
  ]);
  return programs.map((p) => {
    const c = curricula.find((x) => x.programId === p.id);
    return {
      id: p.id.toString(),
      code: p.code,
      name: p.name,
      curriculum: c
        ? {
            id: c.id.toString(),
            version: c.versionLabel,
            effective: c.effectiveSchoolYear,
            entries: c.curriculumSubjects.map((e) => ({
              id: e.id.toString(),
              yearLevel: e.yearLevel,
              semester: e.semester,
              units: e.units.toNumber(),
              isRequired: e.isRequired,
              prerequisites: e.prerequisites.map((x) => ({ id: x.subject.id.toString(), code: x.subject.code })),
              classes: e._count.classes,
              subject: {
                id: e.subject.id.toString(),
                code: e.subject.code,
                title: e.subject.title,
                description: e.subject.description,
                type: e.subject.subjectType,
                defaultUnits: e.subject.defaultUnits.toNumber(),
                lectureHours: e.subject.lectureHours?.toNumber() ?? null,
                labHours: e.subject.labHours?.toNumber() ?? null,
                recommendedClassSize: e.subject.recommendedClassSize,
                remarks: e.subject.remarks,
                isActive: e.subject.isActive,
              },
            })),
          }
        : null,
    };
  });
}

export async function getSubject(id: bigint) {
  const subject = await prisma.subject.findUnique({ where: { id } });
  if (!subject) throw new NotFoundError('Subject not found.');
  return subject;
}

/** The catalogue fields of a subject, with the hours that do not apply to its type dropped. */
function subjectData(input: z.infer<typeof subjectSchema>) {
  const h = normaliseHours({ subjectType: input.subjectType, lectureHours: input.lectureHours ?? null, labHours: input.labHours ?? null });
  return {
    code: input.code,
    title: input.title,
    description: input.description,
    subjectType: input.subjectType,
    defaultUnits: input.defaultUnits,
    lectureHours: h.lectureHours,
    labHours: h.labHours,
    recommendedClassSize: input.recommendedClassSize ?? null,
    remarks: input.remarks ?? null,
    isActive: input.isActive,
  };
}

/** The program's current curriculum: its newest active one (as scheduling and enrollment use). */
async function currentCurriculum(programId: bigint, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const program = await db.program.findUnique({ where: { id: programId }, select: { code: true, isActive: true } });
  if (!program) throw new AppError('Choose a program.', 422, { programId: ['Choose a program.'] });
  const curriculum = await db.curriculum.findFirst({
    where: { programId, isActive: true },
    orderBy: { effectiveSchoolYear: 'desc' },
    select: { id: true, versionLabel: true },
  });
  if (!curriculum) {
    const text = `${program.code} has no active curriculum yet. Create one on the program's page first.`;
    throw new AppError(text, 422, { programId: [text] });
  }
  return { ...curriculum, programCode: program.code };
}

/**
 * Prerequisites must be other subjects already in the same curriculum, so a
 * mapping cannot point at a subject the program does not teach.
 */
async function assertPrerequisites(db: Prisma.TransactionClient | typeof prisma, curriculumId: bigint, subjectId: bigint | null, ids: bigint[]) {
  const unique = [...new Set(ids.map(String))].map(BigInt);
  if (unique.length === 0) return unique;
  if (subjectId !== null && unique.includes(subjectId)) {
    throw new AppError('A subject cannot be its own prerequisite.', 422, { prerequisiteSubjectIds: ['A subject cannot be its own prerequisite.'] });
  }
  const mapped = await db.curriculumSubject.findMany({ where: { curriculumId, subjectId: { in: unique } }, select: { subjectId: true } });
  if (mapped.length !== unique.length) {
    const text = 'Each prerequisite must be a subject already in this curriculum.';
    throw new AppError(text, 422, { prerequisiteSubjectIds: [text] });
  }
  if (subjectId !== null) await assertNoCycle(db, curriculumId, subjectId, unique);
  return unique;
}

/**
 * No circular prerequisites: following the curriculum's prerequisite chains
 * from each chosen prerequisite must never lead back to the subject itself
 * (A needs B, B needs A — or a longer loop).
 */
async function assertNoCycle(db: Prisma.TransactionClient | typeof prisma, curriculumId: bigint, subjectId: bigint, chosen: bigint[]) {
  const edges = await db.curriculumSubjectPrerequisite.findMany({
    where: { curriculumSubject: { curriculumId } },
    select: { subjectId: true, curriculumSubject: { select: { subjectId: true } } },
  });
  // subject → the subjects it requires (excluding the entry being changed, whose list is being replaced).
  const requires = new Map<string, string[]>();
  for (const e of edges) {
    const from = e.curriculumSubject.subjectId.toString();
    if (from === subjectId.toString()) continue;
    requires.set(from, [...(requires.get(from) ?? []), e.subjectId.toString()]);
  }
  const target = subjectId.toString();
  for (const start of chosen.map(String)) {
    const path = [start];
    const seen = new Set<string>();
    const walk = (at: string): boolean => {
      if (at === target) return true;
      if (seen.has(at)) return false;
      seen.add(at);
      for (const next of requires.get(at) ?? []) {
        path.push(next);
        if (walk(next)) return true;
        path.pop();
      }
      return false;
    };
    if (walk(start)) {
      const codes = await db.subject.findMany({ where: { id: { in: [...new Set([target, ...path])].map(BigInt) } }, select: { id: true, code: true } });
      const code = (id: string) => codes.find((c) => c.id.toString() === id)?.code ?? '?';
      const text = `That would make a circular prerequisite: ${[target, ...path].map(code).join(' → ')}.`;
      throw new AppError(text, 422, { prerequisiteSubjectIds: [text] }, 'PREREQUISITE_CYCLE');
    }
  }
}

/**
 * Create a subject and — when a placement is given — place it in its
 * program's current curriculum, in one transaction: the catalogue entry and
 * its mapping, or neither. Without a placement the subject is a catalogue
 * entry only, to be mapped later. The subject stays one record however many
 * curricula use it.
 */
export async function createSubject(input: z.infer<typeof subjectSchema>, placement: z.infer<typeof subjectPlacementSchema> | null) {
  await assertSubjectCodeFree(input.code, null);
  if (!placement) {
    const subject = await prisma.subject.create({ data: { ...subjectData(input), createdAt: new Date(), updatedAt: new Date() } });
    return { id: subject.id.toString(), code: subject.code, curriculum: null, program: null };
  }
  const curriculum = await currentCurriculum(placement.programId);
  return prisma.$transaction(async (tx) => {
    const subject = await tx.subject.create({ data: { ...subjectData(input), createdAt: new Date(), updatedAt: new Date() } });
    const prerequisites = await assertPrerequisites(tx, curriculum.id, subject.id, placement.prerequisiteSubjectIds);
    const entry = await tx.curriculumSubject.create({
      data: {
        curriculumId: curriculum.id,
        subjectId: subject.id,
        prerequisiteSubjectId: prerequisites[0] ?? null,
        yearLevel: placement.yearLevel,
        semester: placement.semester,
        units: input.defaultUnits,
        isRequired: placement.isRequired,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    if (prerequisites.length) {
      await tx.curriculumSubjectPrerequisite.createMany({ data: prerequisites.map((pid) => ({ curriculumSubjectId: entry.id, subjectId: pid })) });
    }
    return { id: subject.id.toString(), code: subject.code, curriculum: curriculum.versionLabel, program: curriculum.programCode };
  });
}

/**
 * Update a subject's catalogue details. Once a class of this subject has its
 * grades finalized or released, its code and units are part of the academic
 * record and are locked; the title, description, hours and remarks stay
 * editable. Curriculum mappings keep their own units either way.
 */
export async function updateSubject(id: bigint, input: z.infer<typeof subjectSchema>) {
  const current = await getSubject(id);
  await assertSubjectCodeFree(input.code, id);
  const codeChanged = current.code !== input.code;
  const unitsChanged = current.defaultUnits.toNumber() !== input.defaultUnits;
  if (codeChanged || unitsChanged) {
    const graded = await prisma.classOffering.count({ where: { subjectId: id, gradeStatus: { in: [...LOCKING_GRADE_STATUSES] } } });
    if (graded > 0) {
      const what = codeChanged && unitsChanged ? 'code and units' : codeChanged ? 'code' : 'units';
      const text = `${current.code} has ${graded} class${graded === 1 ? '' : 'es'} with finalized grades, so its ${what} can no longer change. The title, description, hours and remarks can.`;
      throw new AppError(text, 422, { ...(codeChanged ? { code: [text] } : {}), ...(unitsChanged ? { defaultUnits: [text] } : {}) }, 'SUBJECT_LOCKED');
    }
  }
  return prisma.subject.update({ where: { id }, data: { ...subjectData(input), updatedAt: new Date() } });
}

export async function toggleSubjectActive(id: bigint) {
  const subject = await getSubject(id);
  return prisma.subject.update({
    where: { id },
    data: { isActive: !subject.isActive, updatedAt: new Date() },
  });
}

async function assertSubjectCodeFree(code: string, ignoreId: bigint | null) {
  const clash = await prisma.subject.findFirst({
    where: { code, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new AppError('That subject code is already in use.', 422, { code: ['That subject code is already in use.'] });
}

export async function activeSubjects() {
  const rows = await prisma.subject.findMany({
    where: { isActive: true },
    orderBy: { title: 'asc' },
    select: { id: true, code: true, title: true, defaultUnits: true },
  });
  return rows.map((s) => ({
    id: s.id.toString(),
    code: s.code,
    title: s.title,
    defaultUnits: s.defaultUnits.toNumber(),
  }));
}

// --- Curriculum subjects ---------------------------------------------------

export async function listCurriculumSubjects(curriculumId: bigint) {
  const rows = await prisma.curriculumSubject.findMany({
    where: { curriculumId },
    include: { subject: true, prerequisite: true, prerequisites: { select: { subject: { select: { id: true, code: true, title: true } } } } },
    orderBy: [{ yearLevel: 'asc' }, { semester: 'asc' }],
  });

  return rows.map((e) => ({
    id: e.id.toString(),
    yearLevel: e.yearLevel,
    semester: e.semester,
    units: e.units.toNumber(),
    isRequired: e.isRequired,
    subject: { id: e.subject.id.toString(), code: e.subject.code, title: e.subject.title },
    prerequisite: e.prerequisite
      ? { id: e.prerequisite.id.toString(), code: e.prerequisite.code, title: e.prerequisite.title }
      : null,
    prerequisites: e.prerequisites.map((x) => ({ id: x.subject.id.toString(), code: x.subject.code, title: x.subject.title })),
  }));
}

export async function addCurriculumSubject(input: z.infer<typeof curriculumSubjectSchema>) {
  // Laravel expressed this as a closure rule on subject_id.
  const duplicate = await prisma.curriculumSubject.findFirst({
    where: { curriculumId: input.curriculumId, subjectId: input.subjectId },
    select: { id: true },
  });
  if (duplicate) {
    throw new AppError('This subject is already part of the curriculum.', 422, {
      subjectId: ['This subject is already part of the curriculum.'],
    });
  }

  // exists:subjects,id — verified for real, not just shape-checked.
  const [subject, prerequisite] = await Promise.all([
    prisma.subject.findUnique({ where: { id: input.subjectId }, select: { id: true } }),
    input.prerequisiteSubjectId
      ? prisma.subject.findUnique({ where: { id: input.prerequisiteSubjectId }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (!subject) throw new AppError('The selected subject does not exist.', 422, { subjectId: ['The selected subject does not exist.'] });
  if (input.prerequisiteSubjectId && !prerequisite) {
    throw new AppError('The selected prerequisite does not exist.', 422, {
      prerequisiteSubjectId: ['The selected prerequisite does not exist.'],
    });
  }

  // The list, plus the single prerequisite older callers send.
  const wanted = [...input.prerequisiteSubjectIds, ...(input.prerequisiteSubjectId ? [input.prerequisiteSubjectId] : [])];
  return prisma.$transaction(async (tx) => {
    const prerequisites = await assertPrerequisites(tx, input.curriculumId, input.subjectId, wanted);
    const entry = await tx.curriculumSubject.create({
      data: {
        curriculumId: input.curriculumId,
        subjectId: input.subjectId,
        prerequisiteSubjectId: prerequisites[0] ?? null,
        yearLevel: input.yearLevel,
        semester: input.semester,
        units: input.units,
        isRequired: input.isRequired,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    if (prerequisites.length) {
      await tx.curriculumSubjectPrerequisite.createMany({ data: prerequisites.map((pid) => ({ curriculumSubjectId: entry.id, subjectId: pid })) });
    }
    return entry;
  });
}

/** Change a mapping's units, required/elective and prerequisites. Its term stays: remove and map again to move it. */
export async function updateCurriculumSubject(id: bigint, curriculumId: bigint, input: z.infer<typeof curriculumSubjectUpdateSchema>) {
  const entry = await prisma.curriculumSubject.findUnique({ where: { id }, select: { curriculumId: true, subjectId: true } });
  if (!entry || entry.curriculumId !== curriculumId) throw new NotFoundError('Curriculum subject not found.');
  await prisma.$transaction(async (tx) => {
    const prerequisites = await assertPrerequisites(tx, curriculumId, entry.subjectId, input.prerequisiteSubjectIds);
    await tx.curriculumSubject.update({
      where: { id },
      data: { units: input.units, isRequired: input.isRequired, prerequisiteSubjectId: prerequisites[0] ?? null, updatedAt: new Date() },
    });
    await tx.curriculumSubjectPrerequisite.deleteMany({ where: { curriculumSubjectId: id } });
    if (prerequisites.length) {
      await tx.curriculumSubjectPrerequisite.createMany({ data: prerequisites.map((pid) => ({ curriculumSubjectId: id, subjectId: pid })) });
    }
  });
}

/**
 * Remove an entry. The curriculum id is part of the call so a crafted id
 * cannot delete a row belonging to a different curriculum — the Laravel
 * component asserted the same thing with abort_unless().
 */
export async function removeCurriculumSubject(id: bigint, curriculumId: bigint) {
  const entry = await prisma.curriculumSubject.findUnique({ where: { id }, select: { curriculumId: true } });
  if (!entry) throw new NotFoundError('Curriculum subject not found.');
  if (entry.curriculumId !== curriculumId) throw new NotFoundError('Curriculum subject not found.');
  // A scheduled class teaches this entry: removing it would orphan the class.
  const classes = await prisma.classOffering.count({ where: { curriculumSubjectId: id } });
  if (classes > 0) {
    throw new AppError(`${classes} class${classes === 1 ? ' teaches' : 'es teach'} this subject from this curriculum. Delete or cancel ${classes === 1 ? 'it' : 'them'} under Classes & Sections first.`, 409, undefined, 'CURRICULUM_SUBJECT_IN_USE');
  }
  await prisma.curriculumSubject.delete({ where: { id } });
}
