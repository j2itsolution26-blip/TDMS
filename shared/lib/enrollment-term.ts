import { YEAR_LEVELS } from './teaching';

/**
 * What a new enrollment term may be — shared by the server, which enforces
 * it, and the New Enrollment Term dialog, which offers only these choices.
 *
 *   school year  a configured school year that is not archived (the server
 *                checks the record; approval needs it to place the student)
 *   semester     1st or 2nd (enrollmentSchema)
 *   year level   1st Year up to the student's curriculum's final year — the
 *                highest year any of its subjects sits in — or every TDMS year
 *                level while the curriculum has no subjects to say
 *   uniqueness   one enrollment per student per school year and semester (a
 *                unique index; the dialog warns before the server refuses)
 */

export const ENROLLMENT_SEMESTERS = [1, 2] as const;

export function validYearLevels(finalYear: number | null): number[] {
  if (!finalYear || finalYear < 1) return [...YEAR_LEVELS];
  return YEAR_LEVELS.filter((level) => level <= finalYear);
}

export function termTaken(existing: { schoolYear: string; semester: number }[], schoolYear: string, semester: number): boolean {
  return existing.some((e) => e.schoolYear === schoolYear && e.semester === semester);
}
