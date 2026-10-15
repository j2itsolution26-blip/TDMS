import { Prisma } from '@prisma/client';
import { AppError } from '@/server/lib/http';
import { sectionLabel, SECTION_CAPACITY } from '@shared/lib/teaching';
import { notifyStudents, notifyUsers } from './notifications';

/**
 * Automatic section assignment — an approved enrollment places its student
 * in a section of the same program, year level and school year.
 *
 *   * the first section, in name order (A, B, C … Z, AA …), with fewer than
 *     25 students takes the student — so a seat freed in Section A is filled
 *     before Section B grows;
 *   * when there is no section, or every section is full, the next name in
 *     the sequence is created (A when there are none);
 *   * a student already placed in a section that school year stays where they
 *     are (one section per student per school year is a unique index), so a
 *     retried or repeated approval never places anyone twice.
 *
 * Runs inside the approval's transaction: the enrollment is approved and the
 * student placed together, or neither. Concurrency, inside that transaction:
 *
 *   1. a transaction-scoped advisory lock on (school year, program, year
 *      level) serialises every automatic assignment into that group,
 *      including creating its next section;
 *   2. the group's section rows are locked FOR UPDATE — the lock a manual
 *      "Add students" takes — so manual and automatic placement cannot both
 *      take the last seat;
 *   3. the counts are read with both locks held.
 *
 * A seat is a section_students row: the table has no inactive state, so every
 * row counts, exactly as the roster's own 25-student check counts them.
 */

type Db = Prisma.TransactionClient;

export interface Placement {
  sectionId: bigint;
  label: string;
  /** The section was created for this student (every existing one was full, or none existed). */
  created: boolean;
  /** The student was already in a section this school year; nothing changed. */
  already: boolean;
}

/** Section names in placement order: A … Z, then AA, AB …; other names after, alphabetically. */
export function compareSectionNames(a: string, b: string): number {
  const seq = (n: string) => /^[A-Z]+$/.test(n);
  if (seq(a) !== seq(b)) return seq(a) ? -1 : 1;
  return a.length - b.length || a.localeCompare(b, 'en', { numeric: true });
}

/** The first name in the A, B … Z, AA, AB … sequence not already used. */
export function nextSectionName(existing: string[]): string {
  const used = new Set(existing.map((n) => n.trim().toUpperCase()));
  for (let i = 0; ; i += 1) {
    let n = i;
    let name = '';
    do {
      name = String.fromCharCode(65 + (n % 26)) + name;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    if (!used.has(name)) return name;
  }
}

/** The section a new student joins: the first, in name order, with a free seat — or none. */
export function pickSection<T extends { name: string; count: number }>(sections: T[], capacity = SECTION_CAPACITY): T | null {
  return [...sections].sort((a, b) => compareSectionNames(a.name, b.name)).find((s) => s.count < capacity) ?? null;
}

export async function assignSection(
  tx: Db,
  input: { studentId: bigint; programId: bigint; programCode: string; yearLevel: number; schoolYearId: bigint; schoolYearLabel: string },
): Promise<Placement> {
  const { studentId, programId, yearLevel, schoolYearId } = input;

  // 1. One automatic assignment at a time for this program, year level and school year.
  const key = `section-assignment:${schoolYearId}:${programId}:${yearLevel}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;

  // Already placed this school year (in any section): leave them there.
  const existing = await tx.sectionStudent.findUnique({
    where: { schoolYearId_studentId: { schoolYearId, studentId } },
    select: { sectionId: true, section: { select: { name: true, yearLevel: true, program: { select: { code: true } } } } },
  });
  if (existing) {
    return {
      sectionId: existing.sectionId,
      label: sectionLabel(existing.section.program.code, existing.section.yearLevel, existing.section.name),
      created: false,
      already: true,
    };
  }

  // 2. The group's sections, locked the way a manual addition locks one.
  const locked = await tx.$queryRaw<{ id: bigint; name: string }[]>`
    SELECT id, name FROM sections
    WHERE school_year_id = ${schoolYearId} AND program_id = ${programId} AND year_level = ${yearLevel}
    ORDER BY id
    FOR UPDATE`;
  // 3. Their counts, with the locks held.
  const counts = locked.length
    ? await tx.sectionStudent.groupBy({ by: ['sectionId'], where: { sectionId: { in: locked.map((s) => s.id) } }, _count: { _all: true } })
    : [];
  const sections = locked.map((s) => ({ ...s, count: counts.find((c) => c.sectionId === s.id)?._count._all ?? 0 }));

  let target = pickSection(sections);
  let created = false;
  if (!target) {
    const name = nextSectionName(sections.map((s) => s.name));
    const section = await tx.section.create({ data: { schoolYearId, programId, yearLevel, name }, select: { id: true, name: true } });
    target = { ...section, count: 0 };
    created = true;
  }

  // The last check before writing: never a 26th student.
  if (target.count >= SECTION_CAPACITY) {
    throw new AppError('Every section is full and no new section could be opened. Try again.', 409, undefined, 'SECTION_CAPACITY');
  }
  await tx.sectionStudent.create({ data: { sectionId: target.id, studentId, schoolYearId } });

  const label = sectionLabel(input.programCode, yearLevel, target.name);
  const instructors = await tx.classOffering.findMany({ where: { sectionId: target.id, instructorId: { not: null } }, select: { instructorId: true } });
  await notifyUsers(tx, instructors.map((c) => c.instructorId!), {
    type: 'class.students-added',
    title: `1 student added to ${label}`,
    body: `Your class roster for section ${label} has changed.`,
    href: '/teaching/classes',
  });
  await notifyStudents(tx, [studentId], {
    type: 'section.assigned',
    title: `You were assigned to section ${label}`,
    body: `School year ${input.schoolYearLabel}.`,
    href: '/dashboard',
  });

  return { sectionId: target.id, label, created, already: false };
}

/** Unique-index collisions and serialization failures are worth one more try. */
export function isRetryable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034');
}
