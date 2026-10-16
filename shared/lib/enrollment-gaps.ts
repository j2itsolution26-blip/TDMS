/**
 * Gaps between student records, enrollments and sections, and the order in
 * which the reconciliation fills them.
 *
 *   * A student record with no enrollment at all never reaches Enrollments.
 *     That is reported, never fixed by inventing an enrollment: the office
 *     opens one through the student's Enrollment page, and approving it there
 *     places the student in a section.
 *   * An enrolled enrollment whose student has no section for that school
 *     year (approved before automatic placement existed) is placed, through
 *     the same assignment approvals use.
 */

export interface UnplacedEnrollment {
  enrollmentId: string;
  studentId: string;
  schoolYearId: string;
  programId: string;
  yearLevel: number;
  semester: number;
  /** ISO time it was approved, when the record has one. */
  approvedAt: string | null;
}

/**
 * The placements to make, in a fixed order: oldest approval first (those
 * without an approval time last), then by enrollment id — so the same data
 * always fills the same seats. A student enrolled in both semesters of a
 * school year needs one seat, taken at their earliest enrollment.
 */
export function placementQueue(rows: UnplacedEnrollment[]): UnplacedEnrollment[] {
  const time = (r: UnplacedEnrollment) => (r.approvedAt ? new Date(r.approvedAt).getTime() : Number.POSITIVE_INFINITY);
  const sorted = [...rows].sort((a, b) => time(a) - time(b) || compareIds(a.enrollmentId, b.enrollmentId));
  const seen = new Set<string>();
  return sorted.filter((r) => {
    const key = `${r.studentId}:${r.schoolYearId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Database ids compare as numbers (they are bigints sent as strings). */
function compareIds(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}
