/**
 * What the enrollment confirmation dialogs say. Kept apart from the page so
 * the wording, and the consequences it promises, can be tested; the rules
 * themselves are enforced by the server (enrollment-service.transitionEnrollment).
 */

export type Decision = 'approve' | 'reject';

/** The fields of a pending enrollment the dialogs show. */
export interface DecisionSubject {
  student: { name: string; studentNumber: string };
  schoolYear: string;
  semester: number;
  section: string | null;
}

/** The record being decided, as label/value pairs. A missing section is said, not invented. */
export function decisionSummary(row: DecisionSubject, decision: Decision): [string, string][] {
  return [
    ['Student', row.student.name],
    ['Student number', row.student.studentNumber],
    ['School year', `SY ${row.schoolYear}`],
    ['Semester', `Semester ${row.semester}`],
    ['Section', row.section ?? (decision === 'approve' ? 'Assigned automatically on approval' : 'Not assigned')],
  ];
}

/** What happens once the decision is confirmed. */
export const DECISION_CONSEQUENCES: Record<Decision, string[]> = {
  approve: [
    'The enrollment status changes from Pending to Enrolled, and the student becomes active.',
    'The student is placed in a section of their program for this school year and year level.',
    'This cannot be undone. An enrolled student can only be dropped later, with a reason.',
  ],
  reject: [
    'The enrollment status changes from Pending to Rejected.',
    'A rejected enrollment is final and is not counted as enrolled or dropped.',
    'The reason is kept in the enrollment’s status history.',
  ],
};
