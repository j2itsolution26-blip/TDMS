/** Where an approved student was placed, as the approval endpoint reports it. */
export interface Placement {
  section: string;
  /** The section was opened for this student. */
  created: boolean;
  /** The student was already in a section this school year; nothing moved. */
  already: boolean;
}

/** The message shown after approving an enrollment, naming the section. */
export function approvalNotice(name: string, placement: Placement | null | undefined): string {
  if (!placement) return `Enrollment completed successfully. ${name} is now enrolled.`;
  if (placement.already) return `Enrollment completed successfully. ${name} stays in ${placement.section}, their section for this school year.`;
  return `Enrollment completed successfully. ${name} has been assigned to ${placement.section}${placement.created ? ' — a new section, opened because the others were full' : ''}.`;
}
