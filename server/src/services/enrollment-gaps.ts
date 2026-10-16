import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { placementQueue, type UnplacedEnrollment } from '@shared/lib/enrollment-gaps';
import { assignSection, isRetryable } from '@/server/services/teaching/section-assignment';
import { recordAudit } from '@/server/services/audit-log';

/**
 * Finding and filling the gaps between student records, enrollments and
 * sections (see shared/lib/enrollment-gaps.ts for the rules).
 *
 * Read by the Students list ("Not enrolled"), the Enrollments notice and the
 * Secretary's work queue; written only by scripts/reconcile-enrollments.ts,
 * which previews by default and changes nothing without --apply.
 */

/** A student record with no enrollment of any status, in any term. */
export const WITHOUT_ENROLLMENT: Prisma.StudentWhereInput = { enrollments: { none: {} } };

export function countStudentsWithoutEnrollment(): Promise<number> {
  return prisma.student.count({ where: WITHOUT_ENROLLMENT });
}

/** For the reconciliation report: identifiers only, never names or contact details. */
export async function studentsWithoutEnrollment() {
  const rows = await prisma.student.findMany({
    where: WITHOUT_ENROLLMENT,
    orderBy: { id: 'asc' },
    select: { id: true, studentNumber: true, status: true, yearLevel: true, createdAt: true, program: { select: { code: true } } },
  });
  return rows.map((s) => ({
    studentId: s.id.toString(),
    studentNumber: s.studentNumber,
    status: s.status,
    program: s.program.code,
    yearLevel: s.yearLevel,
    createdAt: s.createdAt?.toISOString() ?? null,
  }));
}

export interface UnplacedRow extends UnplacedEnrollment {
  programCode: string;
  schoolYearLabel: string;
  studentStatus: string;
}

/**
 * Enrolled enrollments in a school year that is not archived, whose student
 * has no section that school year. The school year is the enrollment's own
 * reference, or — for records from before it had one — the year of that label.
 */
export async function unplacedEnrollments(): Promise<UnplacedRow[]> {
  const rows = await prisma.$queryRaw<{
    id: bigint; student_id: bigint; school_year_id: bigint; school_year_label: string; program_id: bigint; program_code: string;
    year_level: number; semester: number; approved_at: Date | null; student_status: string;
  }[]>`
    SELECT e.id, e.student_id, y.id AS school_year_id, y.label AS school_year_label, s.program_id, p.code AS program_code,
           e.year_level, e.semester, e.approved_at, s.status AS student_status
    FROM enrollments e
    JOIN students s ON s.id = e.student_id
    JOIN programs p ON p.id = s.program_id
    JOIN school_years y ON (y.id = e.school_year_id OR (e.school_year_id IS NULL AND y.label = e.school_year))
    WHERE e.status = 'enrolled'
      AND y.status <> 'ARCHIVED'
      AND NOT EXISTS (SELECT 1 FROM section_students ss WHERE ss.student_id = e.student_id AND ss.school_year_id = y.id)`;
  const byId = new Map(rows.map((r) => [r.id.toString(), r]));
  return placementQueue(
    rows.map((r) => ({
      enrollmentId: r.id.toString(),
      studentId: r.student_id.toString(),
      schoolYearId: r.school_year_id.toString(),
      programId: r.program_id.toString(),
      yearLevel: Number(r.year_level),
      semester: Number(r.semester),
      approvedAt: r.approved_at?.toISOString() ?? null,
    })),
  ).map((q) => {
    const r = byId.get(q.enrollmentId)!;
    return { ...q, programCode: r.program_code, schoolYearLabel: r.school_year_label, studentStatus: r.student_status };
  });
}

export interface PlacementOutcome {
  enrollmentId: string;
  outcome: 'placed' | 'already' | 'skipped' | 'failed';
  section?: string;
  created?: boolean;
  reason?: string;
}

/**
 * Place every unplaced enrolled student, one transaction each, through the
 * same assignSection approvals use (its locks, capacity and section opening).
 * A student whose record is no longer active is skipped and reported, not placed.
 * Running it again finds nothing left to do.
 */
export async function placeUnplaced(actor: string): Promise<PlacementOutcome[]> {
  const outcomes: PlacementOutcome[] = [];
  for (const row of await unplacedEnrollments()) {
    if (row.studentStatus !== 'active') {
      outcomes.push({ enrollmentId: row.enrollmentId, outcome: 'skipped', reason: `student record is ${row.studentStatus}, not active` });
      continue;
    }
    const place = () => prisma.$transaction(
      (tx) => assignSection(tx, {
        studentId: BigInt(row.studentId),
        programId: BigInt(row.programId),
        programCode: row.programCode,
        yearLevel: row.yearLevel,
        schoolYearId: BigInt(row.schoolYearId),
        schoolYearLabel: row.schoolYearLabel,
      }),
      { maxWait: 10_000, timeout: 20_000 },
    );
    try {
      let placed;
      for (let attempt = 1; ; attempt += 1) {
        try {
          placed = await place();
          break;
        } catch (error) {
          if (attempt < 3 && isRetryable(error)) continue;
          throw error;
        }
      }
      if (placed.already) {
        outcomes.push({ enrollmentId: row.enrollmentId, outcome: 'already', section: placed.label });
        continue;
      }
      await recordAudit({
        action: placed.created ? 'SECTION_CREATED_AND_STUDENT_ASSIGNED' : 'SECTION_STUDENT_ASSIGNED',
        actor,
        target: placed.label,
        details: { studentId: row.studentId, enrollment_id: row.enrollmentId, automatic: true, reconciliation: true },
      });
      outcomes.push({ enrollmentId: row.enrollmentId, outcome: 'placed', section: placed.label, created: placed.created });
    } catch (error) {
      outcomes.push({ enrollmentId: row.enrollmentId, outcome: 'failed', reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}
