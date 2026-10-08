import { yearLevelLabel } from './teaching';

/**
 * How a class and a student are named on screen. Shared, so a screen and the
 * server that loads it label things identically.
 */

/** "Dela Cruz, Juan M." */
export function studentName(s: { firstName: string; lastName: string; middleName?: string | null }): string {
  const mi = s.middleName ? ` ${s.middleName.charAt(0)}.` : '';
  return `${s.lastName}, ${s.firstName}${mi}`;
}

export interface LabelledClass {
  subject: { title: string; code: string };
  section: { name: string; yearLevel: number; program: { code: string; name: string } };
}

/** "Database Management" and "DIT · 3rd Year · Section A". */
export function classHeading(cls: LabelledClass) {
  return {
    subject: cls.subject.title,
    subjectCode: cls.subject.code,
    detail: `${cls.section.program.code} · ${yearLevelLabel(cls.section.yearLevel)} · Section ${cls.section.name}`,
    program: cls.section.program.name,
  };
}
