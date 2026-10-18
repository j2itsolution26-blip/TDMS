import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { SEMESTER_LABELS } from '@shared/lib/teaching';

/**
 * "Currently enrolled" — one definition, used by the Programs page counts and
 * by the Students page filter they link to, so a count and the list behind it
 * always agree.
 *
 * A student is currently enrolled when:
 *   * the student record is Active (approving an enrollment makes it so;
 *     applicants, transferred, graduated, dropped and archived records are out);
 *   * and they have an Enrolled enrollment for the current term — the active
 *     school year and its current semester. Pending, rejected and dropped
 *     enrollments do not count.
 *
 * Counted per student, never per enrollment row, and under the student's own
 * program. With no active school year there is no current term, and nobody is
 * currently enrolled.
 */

export interface CurrentTerm {
  schoolYear: string;
  semester: number;
  /** "SY 2026-2027 · 1st Semester" */
  label: string;
}

export async function currentTerm(): Promise<CurrentTerm | null> {
  const year = await prisma.schoolYear.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { startsOn: 'desc' },
    select: { label: true, currentSemester: true },
  });
  if (!year) return null;
  return {
    schoolYear: year.label,
    semester: year.currentSemester,
    label: `SY ${year.label} · ${SEMESTER_LABELS[year.currentSemester] ?? `Semester ${year.currentSemester}`}`,
  };
}

/** The students currently enrolled in `term` (none when there is no current term). */
export function currentlyEnrolledWhere(term: CurrentTerm | null): Prisma.StudentWhereInput {
  if (!term) return { id: { in: [] } };
  return {
    status: 'active',
    enrollments: { some: { status: 'enrolled', schoolYear: term.schoolYear, semester: term.semester } },
  };
}

/** Currently enrolled students per program id — one grouped query, no student rows fetched. */
export async function enrolledCountsByProgram(term: CurrentTerm | null): Promise<Map<string, number>> {
  if (!term) return new Map();
  const rows = await prisma.student.groupBy({
    by: ['programId'],
    where: currentlyEnrolledWhere(term),
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.programId.toString(), r._count._all]));
}
