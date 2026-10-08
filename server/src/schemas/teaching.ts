import { z } from 'zod';
import {
  ASSESSMENT_KINDS,
  ATTENDANCE_STATUSES,
  BADGE_KEYS,
  CALENDAR_TYPES,
  DOCUMENT_KINDS,
  EXAM_TYPES,
  REQUESTABLE_STATUSES,
  SUPPORT_STATUSES,
  timeToMinutes,
} from '@shared/lib/teaching';
import { idSchema } from './schemas';

/**
 * Request shapes for the Diploma Instructor module. Every body an Instructor,
 * office role or student sends is parsed through one of these before a
 * service sees it; ids arrive as strings and leave as bigints.
 */

const text = (max: number) => z.string().trim().max(max);
const required = (max: number, message = 'This field is required.') => z.string().trim().min(1, message).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.');
export const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid time.');

// --- School years ---------------------------------------------------------------

export const schoolYearSchema = z
  .object({
    label: z.string().regex(/^\d{4}-\d{4}$/, 'Use the form 2027-2028.'),
    startsOn: dayKey,
    endsOn: dayKey,
  })
  .refine((v) => Number(v.label.slice(5)) === Number(v.label.slice(0, 4)) + 1, {
    message: 'The second year must follow the first, e.g. 2027-2028.',
    path: ['label'],
  });

export const archiveSchoolYearSchema = z.object({
  acknowledge: z.boolean().default(false),
  createNext: z.boolean().default(true),
  nextStartsOn: dayKey.optional(),
  nextEndsOn: dayKey.optional(),
});

export const semesterSchema = z.object({ semester: z.coerce.number().int().min(1).max(3) });

// --- Sections and classes -------------------------------------------------------

export const sectionSchema = z.object({
  schoolYearId: idSchema,
  programId: idSchema,
  yearLevel: z.coerce.number().int().min(1).max(6),
  name: required(50),
});

export const sectionRenameSchema = z.object({ name: required(50) });

export const rosterSchema = z.object({ studentIds: z.array(idSchema).min(1).max(200) });

const scheduleSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    startTime: clockTime,
    endTime: clockTime,
    room: optionalText(50),
  })
  .refine((s) => timeToMinutes(s.endTime) > timeToMinutes(s.startTime), { message: 'The class must end after it starts.', path: ['endTime'] });

export const classSchema = z.object({
  sectionId: idSchema,
  subjectId: idSchema,
  semester: z.coerce.number().int().min(1).max(3),
  instructorId: idSchema.nullable().optional(),
  room: optionalText(50),
  passingGrade: z.coerce.number().min(0).max(100).default(75),
  schedules: z.array(scheduleSchema).max(14).default([]),
});

export const classUpdateSchema = classSchema.omit({ sectionId: true, subjectId: true, semester: true });

export const weightsSchema = z
  .object(Object.fromEntries(ASSESSMENT_KINDS.map((k) => [k, z.coerce.number().min(0).max(100)])) as Record<(typeof ASSESSMENT_KINDS)[number], z.ZodNumber>)
  .refine((w) => Math.round(Object.values(w).reduce((s, n) => s + n, 0)) === 100, { message: 'The weights must add up to 100%.', path: ['QUIZ'] });

// --- Attendance -----------------------------------------------------------------

export const openSessionSchema = z
  .object({
    classId: idSchema,
    meetingDate: dayKey,
    startTime: clockTime,
    endTime: clockTime,
    lateAfterMinutes: z.coerce.number().int().min(0).max(120).default(15),
  })
  .refine((s) => timeToMinutes(s.endTime) > timeToMinutes(s.startTime), { message: 'The meeting must end after it starts.', path: ['endTime'] });

/** A scan carries the QR's token, or a typed student number when a card won't read. */
export const scanSchema = z.object({ code: required(128, 'Scan a QR code or type a student ID.') });

export const markAttendanceSchema = z.object({
  studentId: idSchema,
  status: z.enum(ATTENDANCE_STATUSES),
});

// --- Assessments ----------------------------------------------------------------

export const assessmentSchema = z
  .object({
    classId: idSchema,
    kind: z.enum(ASSESSMENT_KINDS),
    examType: z.enum(EXAM_TYPES).nullable().optional(),
    title: required(255),
    description: optionalText(5000),
    instructions: optionalText(5000),
    date: dayKey.nullable().optional(),
    startTime: clockTime.nullable().optional(),
    endTime: clockTime.nullable().optional(),
    durationMinutes: z.coerce.number().int().min(1).max(600).nullable().optional(),
    totalItems: z.coerce.number().int().min(0).max(500).default(0),
    totalPoints: z.coerce.number().positive('Total points must be more than zero.').max(10000),
    passingScore: z.coerce.number().min(0).max(10000).nullable().optional(),
    onlineEnabled: z.boolean().default(false),
  })
  .superRefine((a, ctx) => {
    if (a.kind === 'EXAM' && !a.examType) ctx.addIssue({ code: 'custom', message: 'Choose the type of examination.', path: ['examType'] });
    // Quizzes and exams are scheduled to the minute; activities and PT may be open-ended.
    if ((a.kind === 'QUIZ' || a.kind === 'EXAM') && (!a.date || !a.startTime || !a.endTime)) {
      ctx.addIssue({ code: 'custom', message: 'Set the date, start time and end time.', path: ['date'] });
    }
    if ((a.startTime || a.endTime) && !a.date) ctx.addIssue({ code: 'custom', message: 'Set the date.', path: ['date'] });
    if (a.startTime && a.endTime && timeToMinutes(a.endTime) <= timeToMinutes(a.startTime)) {
      ctx.addIssue({ code: 'custom', message: 'The end time must be after the start time.', path: ['endTime'] });
    }
    if (a.passingScore != null && a.passingScore > a.totalPoints) {
      ctx.addIssue({ code: 'custom', message: 'The passing score cannot exceed the total points.', path: ['passingScore'] });
    }
  });

export const answerKeySchema = z.object({
  items: z
    .array(
      z.object({
        number: z.coerce.number().int().min(1).max(500),
        prompt: optionalText(2000),
        choices: z.array(text(500)).max(10).nullable().optional(),
        answer: required(255, 'Every item needs an answer.'),
        points: z.coerce.number().positive().max(1000).default(1),
      }),
    )
    .max(500)
    .refine((items) => new Set(items.map((i) => i.number)).size === items.length, { message: 'Item numbers must be unique.' }),
});

export const scoresSchema = z.object({
  scores: z
    .array(z.object({ studentId: idSchema, points: z.coerce.number().min(0).max(10000).nullable() }))
    .max(500),
});

export const checkSheetSchema = z.object({
  code: required(128, 'Scan the student QR or type a student ID.'),
  answers: z.union([z.string().max(5000), z.record(z.string(), z.string().max(255))]),
  /** A second check of the same student replaces the first only when asked. */
  replace: z.boolean().default(false),
});

export const assessmentActionSchema = z.object({ action: z.enum(['publish', 'unpublish', 'finalize', 'release', 'reopen']) });

/** `final: false` saves progress; `final: true` hands the attempt in. */
export const submitAttemptSchema = z.object({
  answers: z.record(z.string(), z.string().max(255)),
  final: z.boolean().default(true),
});

// --- Gradebook ------------------------------------------------------------------

export const gradeNotesSchema = z.object({
  notes: z.array(z.object({ studentId: idSchema, note: optionalText(500) })).max(500),
});

export const gradeActionSchema = z.object({ action: z.enum(['finalize', 'release', 'reopen']) });

// --- Documents ------------------------------------------------------------------

export const documentFieldsSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  classId: idSchema,
  title: required(255),
  documentDate: dayKey.nullable().optional(),
  details: z.record(z.string(), z.string().max(5000)).default({}),
});

export const documentReviewSchema = z.object({
  action: z.enum(['start', 'approve', 'return']),
  note: optionalText(2000),
});

// --- Students -------------------------------------------------------------------

export const statusRequestSchema = z.object({
  classId: idSchema,
  studentId: idSchema,
  requestedStatus: z.enum(REQUESTABLE_STATUSES),
  reason: required(2000, 'Give a reason.'),
});

export const decideStatusRequestSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: optionalText(2000),
});

export const learningSupportSchema = z.object({
  classId: idSchema,
  studentId: idSchema,
  difficulty: required(2000, 'Describe the observed difficulty.'),
  evidence: optionalText(2000),
  interventions: z.array(required(200)).max(12).default([]),
  support: optionalText(2000),
  followUpOn: dayKey.nullable().optional(),
  notes: optionalText(2000),
  status: z.enum(SUPPORT_STATUSES).default('OPEN'),
});

export const learningSupportUpdateSchema = learningSupportSchema.omit({ classId: true, studentId: true });

export const badgeSchema = z.object({
  classId: idSchema,
  studentId: idSchema,
  badge: z.enum(BADGE_KEYS as [string, ...string[]]),
  reason: required(255, 'Give a reason.'),
  message: optionalText(1000),
  awardedOn: dayKey,
});

// --- Calendar -------------------------------------------------------------------

export const calendarEventSchema = z
  .object({
    title: required(255),
    description: optionalText(2000),
    type: z.enum(CALENDAR_TYPES),
    startsOn: dayKey,
    endsOn: dayKey,
    notify: z.boolean().default(false),
  })
  .refine((e) => e.endsOn >= e.startsOn, { message: 'The event must end on or after its start.', path: ['endsOn'] });

// --- PDS ------------------------------------------------------------------------

const s = (max = 255) => z.string().trim().max(max).optional().default('');
const row = <T extends z.ZodRawShape>(shape: T) => z.array(z.object(shape)).max(40).default([]);

export const pdsSchema = z.object({
  employeeId: s(64),
  personal: z
    .object({
      dateOfBirth: z.union([dayKey, z.literal('')]).optional().default(''),
      placeOfBirth: s(),
      sex: s(20),
      civilStatus: s(20),
      citizenship: s(100),
      contactNumber: s(40),
      address: s(500),
    })
    .default({}),
  family: z
    .object({
      spouse: z.object({ name: s(), occupation: s() }).optional(),
      children: row({ name: s(), dateOfBirth: s(20) }),
      father: z.object({ name: s(), occupation: s() }).optional(),
      mother: z.object({ name: s(), occupation: s() }).optional(),
      notes: s(1000),
    })
    .default({}),
  education: row({ level: s(40), school: s(), degree: s(), yearGraduated: s(10) }),
  eligibility: row({ eligibility: s(), rating: s(20), examDate: s(20), examPlace: s(), licenseNumber: s(60), licenseValidity: s(20) }),
  work: row({ position: s(), employer: s(), from: s(20), to: s(20), salary: s(60), status: s(60), relevant: s(1000) }),
  training: row({ title: s(), type: s(40), provider: s(), from: s(20), to: s(20), hours: s(10), certificate: s() }),
});
