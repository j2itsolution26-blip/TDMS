import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError, NotFoundError } from '@/lib/http';
import type { z } from 'zod';
import type {
  programSchema,
  subjectSchema,
  curriculumSchema,
  curriculumSubjectSchema,
} from '@/server/validation/schemas';

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

export async function listSubjects(page = 1) {
  const [rows, total] = await Promise.all([
    prisma.subject.findMany({
      orderBy: { code: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.subject.count(),
  ]);

  return paginate(
    rows.map((s) => ({
      id: s.id.toString(),
      code: s.code,
      title: s.title,
      description: s.description,
      subjectType: s.subjectType,
      defaultUnits: s.defaultUnits.toNumber(),
      isActive: s.isActive,
    })),
    total,
    page,
  );
}

export async function getSubject(id: bigint) {
  const subject = await prisma.subject.findUnique({ where: { id } });
  if (!subject) throw new NotFoundError('Subject not found.');
  return subject;
}

export async function createSubject(input: z.infer<typeof subjectSchema>) {
  await assertSubjectCodeFree(input.code, null);
  return prisma.subject.create({
    data: {
      code: input.code,
      title: input.title,
      description: input.description,
      subjectType: input.subjectType,
      defaultUnits: input.defaultUnits,
      isActive: input.isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

export async function updateSubject(id: bigint, input: z.infer<typeof subjectSchema>) {
  await getSubject(id);
  await assertSubjectCodeFree(input.code, id);
  return prisma.subject.update({
    where: { id },
    data: {
      code: input.code,
      title: input.title,
      description: input.description,
      subjectType: input.subjectType,
      defaultUnits: input.defaultUnits,
      isActive: input.isActive,
      updatedAt: new Date(),
    },
  });
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
    include: { subject: true, prerequisite: true },
    orderBy: [{ yearLevel: 'asc' }, { semester: 'asc' }],
  });

  return rows.map((e) => ({
    id: e.id.toString(),
    yearLevel: e.yearLevel,
    semester: e.semester,
    units: e.units.toNumber(),
    subject: { id: e.subject.id.toString(), code: e.subject.code, title: e.subject.title },
    prerequisite: e.prerequisite
      ? { id: e.prerequisite.id.toString(), code: e.prerequisite.code, title: e.prerequisite.title }
      : null,
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

  return prisma.curriculumSubject.create({
    data: {
      curriculumId: input.curriculumId,
      subjectId: input.subjectId,
      prerequisiteSubjectId: input.prerequisiteSubjectId ?? null,
      yearLevel: input.yearLevel,
      semester: input.semester,
      units: input.units,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
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
  await prisma.curriculumSubject.delete({ where: { id } });
}
