import type { SubjectType } from '@shared/types/domain';

/**
 * Subject rules shared by the server (which enforces them) and the subject
 * form (which shows only the fields that apply).
 *
 * Contact hours by type: a lecture subject has lecture hours, a laboratory
 * subject laboratory hours, a lecture-and-laboratory subject both. Practical,
 * capstone and OJT subjects may record either. Total contact hours is always
 * the sum, never stored.
 */
export function hourFields(type: SubjectType | string): { lecture: boolean; lab: boolean } {
  if (type === 'lecture') return { lecture: true, lab: false };
  if (type === 'laboratory') return { lecture: false, lab: true };
  return { lecture: true, lab: true };
}

/** Drop the hours that do not apply to the type, so an edit cannot leave stale ones. */
export function normaliseHours<T extends { subjectType: string; lectureHours?: number | null; labHours?: number | null }>(s: T): T {
  const f = hourFields(s.subjectType);
  return { ...s, lectureHours: f.lecture ? s.lectureHours ?? null : null, labHours: f.lab ? s.labHours ?? null : null };
}

export function totalHours(s: { lectureHours: number | null; labHours: number | null }): number | null {
  return s.lectureHours === null && s.labHours === null ? null : (s.lectureHours ?? 0) + (s.labHours ?? 0);
}

/** A laboratory subject needs a laboratory room; a lecture-and-laboratory subject may use either. */
export function needsLaboratory(type: SubjectType | string): boolean {
  return type === 'laboratory';
}

/** Grade states after which a class's subject code and units are part of the record. */
export const LOCKING_GRADE_STATUSES = ['FINALIZED', 'RELEASED'] as const;
