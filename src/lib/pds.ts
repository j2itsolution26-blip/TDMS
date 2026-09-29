/**
 * The Instructor Personal Data Sheet: its shape and how complete it is.
 *
 * Shared by the Instructor's own editor, the Director's read-only view and
 * the server's validation, so "85% complete — missing: Place of Birth" means
 * the same thing everywhere.
 */

export interface PdsPersonal {
  dateOfBirth?: string;
  placeOfBirth?: string;
  sex?: string;
  civilStatus?: string;
  citizenship?: string;
  contactNumber?: string;
  address?: string;
}

export interface PdsPerson {
  name?: string;
  occupation?: string;
}

export interface PdsFamily {
  spouse?: PdsPerson;
  children?: { name?: string; dateOfBirth?: string }[];
  father?: PdsPerson;
  mother?: PdsPerson;
  notes?: string;
}

export interface PdsEducation {
  level?: string;
  school?: string;
  degree?: string;
  yearGraduated?: string;
}

export interface PdsEligibility {
  eligibility?: string;
  rating?: string;
  examDate?: string;
  examPlace?: string;
  licenseNumber?: string;
  licenseValidity?: string;
}

export interface PdsWork {
  position?: string;
  employer?: string;
  from?: string;
  to?: string;
  salary?: string;
  status?: string;
  relevant?: string;
}

export interface PdsTraining {
  title?: string;
  type?: string;
  provider?: string;
  from?: string;
  to?: string;
  hours?: string;
  certificate?: string;
}

export interface PdsData {
  employeeId: string;
  personal: PdsPersonal;
  family: PdsFamily;
  education: PdsEducation[];
  eligibility: PdsEligibility[];
  work: PdsWork[];
  training: PdsTraining[];
}

export const PDS_SECTIONS = ['personal', 'family', 'education', 'eligibility', 'work', 'training'] as const;
export type PdsSection = (typeof PDS_SECTIONS)[number];

export const PDS_SECTION_LABELS: Record<PdsSection, string> = {
  personal: 'Personal Information',
  family: 'Family Background',
  education: 'Educational Background',
  eligibility: 'Civil Service Eligibility',
  work: 'Work Experience',
  training: 'Learning and Development',
};

export const EDUCATION_LEVELS = ['Elementary', 'Secondary', 'Vocational/TVET', 'College', 'Graduate Studies'] as const;
export const SEX_OPTIONS = ['Male', 'Female'] as const;
export const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Other'] as const;
export const TRAINING_TYPES = ['Training Program', 'Seminar', 'Workshop', 'Conference', 'Other'] as const;

const filled = (v: unknown) => typeof v === 'string' && v.trim() !== '';

/** Required fields per section, with the label shown when one is missing. */
const PERSONAL_REQUIRED: [keyof PdsPersonal, string][] = [
  ['dateOfBirth', 'Date of Birth'],
  ['placeOfBirth', 'Place of Birth'],
  ['sex', 'Sex'],
  ['civilStatus', 'Civil Status'],
  ['citizenship', 'Citizenship'],
  ['contactNumber', 'Contact Number'],
  ['address', 'Address'],
];

const ROW_REQUIRED: Record<'education' | 'eligibility' | 'work' | 'training', [string, string][]> = {
  education: [['level', 'Level'], ['school', 'School'], ['yearGraduated', 'Year Graduated']],
  eligibility: [['eligibility', 'Eligibility'], ['rating', 'Rating'], ['examDate', 'Date of Examination'], ['examPlace', 'Place of Examination']],
  work: [['position', 'Position'], ['employer', 'Employer'], ['from', 'Inclusive Dates (from)']],
  training: [['title', 'Title'], ['provider', 'Provider'], ['from', 'Date'], ['hours', 'Hours']],
};

export interface SectionCompletion {
  section: PdsSection;
  label: string;
  percent: number;
  missing: string[];
}

function rowsCompletion(rows: Record<string, unknown>[], required: [string, string][], noun: string): { percent: number; missing: string[] } {
  if (rows.length === 0) return { percent: 0, missing: [`At least one ${noun}`] };
  let have = 0;
  const missing: string[] = [];
  rows.forEach((row, i) => {
    for (const [key, label] of required) {
      if (filled(row[key])) have += 1;
      else missing.push(`${label} (entry ${i + 1})`);
    }
  });
  return { percent: Math.round((have / (rows.length * required.length)) * 100), missing };
}

export function pdsCompletion(data: PdsData): { overall: number; sections: SectionCompletion[] } {
  const sections: SectionCompletion[] = [];

  const personalMissing: string[] = [];
  if (!filled(data.employeeId)) personalMissing.push('Employee ID');
  for (const [key, label] of PERSONAL_REQUIRED) if (!filled(data.personal[key])) personalMissing.push(label);
  const personalTotal = PERSONAL_REQUIRED.length + 1;
  sections.push({
    section: 'personal',
    label: PDS_SECTION_LABELS.personal,
    percent: Math.round(((personalTotal - personalMissing.length) / personalTotal) * 100),
    missing: personalMissing,
  });

  // Parents are asked of everyone; spouse and children only apply to some.
  const familyMissing: string[] = [];
  if (!filled(data.family.father?.name)) familyMissing.push("Father's Name");
  if (!filled(data.family.mother?.name)) familyMissing.push("Mother's Maiden Name");
  sections.push({
    section: 'family',
    label: PDS_SECTION_LABELS.family,
    percent: Math.round(((2 - familyMissing.length) / 2) * 100),
    missing: familyMissing,
  });

  const nouns = { education: 'school attended', eligibility: 'eligibility', work: 'work experience entry', training: 'training entry' } as const;
  for (const key of ['education', 'eligibility', 'work', 'training'] as const) {
    const r = rowsCompletion(data[key] as Record<string, unknown>[], ROW_REQUIRED[key], nouns[key]);
    sections.push({ section: key, label: PDS_SECTION_LABELS[key], ...r });
  }

  const overall = Math.round(sections.reduce((s, x) => s + x.percent, 0) / sections.length);
  return { overall, sections };
}

/** A stored row, read defensively: JSON columns hold whatever was saved. */
export function readPds(row: {
  employeeId: string | null;
  personal: unknown;
  family: unknown;
  education: unknown;
  eligibility: unknown;
  work: unknown;
  training: unknown;
} | null): PdsData {
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const arr = (v: unknown) => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : []);
  return {
    employeeId: row?.employeeId ?? '',
    personal: obj(row?.personal) as PdsPersonal,
    family: obj(row?.family) as PdsFamily,
    education: arr(row?.education) as PdsEducation[],
    eligibility: arr(row?.eligibility) as PdsEligibility[],
    work: arr(row?.work) as PdsWork[],
    training: arr(row?.training) as PdsTraining[],
  };
}
