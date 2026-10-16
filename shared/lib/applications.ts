import type { ApplicationStatus } from '@shared/types/domain';

/**
 * Admission application rules, shared by the server (which enforces them) and
 * the screens (which show what is missing before anyone presses a button).
 *
 *   draft ──submit──▶ submitted ──start review──▶ under_review
 *                        │                            │
 *                        └──────┬─────────────────────┘
 *                               ├─ approve ─▶ approved  (student created or linked,
 *                               │                        pending enrollment opened)
 *                               ├─ return ──▶ returned  ──submit──▶ submitted
 *                               └─ reject ──▶ rejected
 *
 * Recording an application is not enrollment: approval hands the applicant to
 * Enrollments as a PENDING enrollment, which still needs its own approval.
 */

export type ApplicationAction = 'submit' | 'start_review' | 'approve' | 'return' | 'reject';

const FROM: Record<ApplicationAction, readonly ApplicationStatus[]> = {
  submit: ['draft', 'returned'],
  start_review: ['submitted'],
  approve: ['submitted', 'under_review'],
  return: ['submitted', 'under_review'],
  reject: ['submitted', 'under_review'],
};

export function canTransition(status: string, action: ApplicationAction): boolean {
  return (FROM[action] as readonly string[]).includes(status);
}

/** The statuses an action may start from — for a guarded UPDATE … WHERE status IN (…). */
export function statusesFor(action: ApplicationAction): ApplicationStatus[] {
  return [...FROM[action]];
}

/** Details can be corrected until a decision is final. */
export function isEditable(status: string): boolean {
  return ['draft', 'submitted', 'under_review', 'returned'].includes(status);
}

/** Still in progress: a second application for the same person would be a duplicate. */
export const OPEN_STATUSES: readonly ApplicationStatus[] = ['draft', 'submitted', 'under_review', 'returned'];

// --- Documents ---------------------------------------------------------------

export const DOCUMENT_STATUSES = ['pending', 'submitted', 'verified', 'rejected'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  verified: 'Verified',
  rejected: 'Rejected',
};

/** A document counts as handed in once a file is uploaded or the paper copy received. */
export function isHandedIn(status: string): boolean {
  return status === 'submitted' || status === 'verified';
}

// --- Educational background --------------------------------------------------

export const EDUCATION_LEVELS = [
  'senior_high',
  'high_school',
  'als',
  'vocational',
  'college_level',
  'college_graduate',
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  senior_high: 'Senior High School graduate',
  high_school: 'High School graduate (old curriculum)',
  als: 'ALS Accreditation & Equivalency passer',
  vocational: 'Vocational / TESDA certificate holder',
  college_level: 'College level (undergraduate)',
  college_graduate: 'College graduate',
};

export const SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] as const;

// --- What a submission needs ---------------------------------------------------

export interface ApplicationFields {
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | Date | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  programId?: string | bigint | null;
  schoolYearId?: string | bigint | null;
  highestEducation?: string | null;
  previousSchool?: string | null;
}

export interface RequirementState {
  id: string;
  name: string;
  isRequired: boolean;
  /** The document's status on this application; pending when there is none. */
  status: string;
}

/** Field → [step, label]; the step tells the form where to send the user back to. */
export const SUBMISSION_FIELDS: Record<keyof ApplicationFields, [1 | 2, string]> = {
  firstName: [1, 'First name'],
  lastName: [1, 'Last name'],
  dateOfBirth: [1, 'Date of birth'],
  email: [1, 'Email address'],
  phone: [1, 'Mobile number'],
  address: [1, 'Complete address'],
  programId: [1, 'Diploma program'],
  schoolYearId: [1, 'Preferred school year'],
  highestEducation: [2, 'Highest educational attainment'],
  previousSchool: [2, 'Previous school'],
};

const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * Everything that stops an application from being submitted, as
 * { field: [message] } — the shape the forms render. Documents are keyed
 * `documents.<requirement id>`.
 */
export function submissionProblems(app: ApplicationFields, requirements: RequirementState[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [field, [, label]] of Object.entries(SUBMISSION_FIELDS)) {
    if (blank(app[field as keyof ApplicationFields])) out[field] = [`${label} is required.`];
  }
  for (const r of requirements) {
    if (r.isRequired && !isHandedIn(r.status)) out[`documents.${r.id}`] = [`${r.name} is required — upload it or mark the paper copy as received.`];
  }
  return out;
}

/** The step to show first for a set of problems (documents are on step 3). */
export function firstProblemStep(problems: Record<string, string[]>): 1 | 2 | 3 | null {
  const keys = Object.keys(problems);
  if (keys.length === 0) return null;
  const steps = keys.map((k) => (k.startsWith('documents.') ? 3 : SUBMISSION_FIELDS[k as keyof ApplicationFields]?.[0] ?? 1));
  return Math.min(...steps) as 1 | 2 | 3;
}

/** Approval needs every required document verified by a reviewer. */
export function approvalProblems(requirements: RequirementState[]): string[] {
  return requirements
    .filter((r) => r.isRequired && r.status !== 'verified')
    .map((r) => `${r.name} is not verified yet.`);
}

/** "4/5" — handed in out of all that apply. */
export function documentProgress(requirements: RequirementState[]): { handedIn: number; verified: number; total: number } {
  return {
    handedIn: requirements.filter((r) => isHandedIn(r.status)).length,
    verified: requirements.filter((r) => r.status === 'verified').length,
    total: requirements.length,
  };
}

export function applicationNumber(createdAt: Date, id: bigint | number | string): string {
  return `APP-${createdAt.getFullYear()}-${String(id).padStart(4, '0')}`;
}

