import { z } from 'zod';
import { idSchema } from './schemas';
import { ACTIVITY_STATUSES, ACTIVITY_TYPES, RESULT_VALUES } from '@shared/lib/assessment-center';

/** Validation for the TVET Assessment Center. Every rule is re-checked here, whatever the form did. */

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const optionalId = z.union([idSchema, z.literal(''), z.null()]).optional().transform((v) => (v === '' || v === undefined ? null : v));

/** `YYYY-MM-DD`, a real calendar date (2026-02-31 is refused, not rolled over). */
export const dayKey = z
  .string()
  .trim()
  .refine((v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Enter a valid date.');

const optionalDay = z.union([dayKey, z.literal('')]).optional().transform((v) => (v ? v : undefined));

export const batchSchema = z.object({
  batchNumber: z
    .string()
    .trim()
    .min(1, 'Enter a batch number.')
    .max(40, 'Keep the batch number to 40 characters.')
    .regex(/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/, 'Use letters, numbers, spaces, dots, dashes or slashes.'),
  programId: idSchema,
  assessmentDate: dayKey,
  venue: optionalText(255),
  assessorUserId: optionalId,
  /** Required unless an assessor account is chosen, whose name is then used. */
  assessorName: optionalText(255),
  notes: optionalText(2000),
}).refine((d) => d.assessorUserId !== null || d.assessorName !== null, {
  message: 'Choose an assessor or enter the assessor\'s name.',
  path: ['assessorName'],
});

export const enrolSchema = z.object({
  studentIds: z.array(idSchema).min(1, 'Choose at least one candidate.').max(200, 'Add at most 200 candidates at a time.'),
});

export const recordResultSchema = z.object({
  result: z.enum(RESULT_VALUES, { errorMap: () => ({ message: 'Choose Competent or Not Yet Competent.' }) }),
  remarks: optionalText(500),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(1, 'Give a reason.').max(500),
});

export const reassessSchema = z.object({ targetBatchId: idSchema });

export const resultFilterSchema = z.object({
  batchId: optionalId,
  programId: optionalId,
  date: optionalDay,
  from: optionalDay,
  to: optionalDay,
  assessor: z.string().trim().max(255).optional().transform((v) => (v ? v : undefined)),
  candidate: z.string().trim().max(255).optional().transform((v) => (v ? v : undefined)),
  result: z.enum(['C', 'NYC', 'PENDING']).optional().or(z.literal('').transform(() => undefined)),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
});
export type ResultFilters = z.infer<typeof resultFilterSchema>;

export const reportFilterSchema = z.object({
  batchId: optionalId,
  programId: optionalId,
  assessor: z.string().trim().max(255).optional().transform((v) => (v ? v : undefined)),
  from: optionalDay,
  to: optionalDay,
});
export type ReportFilters = z.infer<typeof reportFilterSchema>;

const instant = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Enter a valid date and time.')
  .transform((v) => new Date(v));

/** The longest single activity: a multi-week training block. */
const MAX_ACTIVITY_MS = 92 * 24 * 60 * 60 * 1000;

export const activitySchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a title.').max(255),
    description: optionalText(2000),
    activityType: z.enum(ACTIVITY_TYPES, { errorMap: () => ({ message: 'Choose Training or Assessment.' }) }),
    programId: optionalId,
    batchId: optionalId,
    startsAt: instant,
    endsAt: instant,
    venue: optionalText(255),
    assignedUserId: optionalId,
    assignedName: optionalText(255),
    responsibleUserId: optionalId,
    responsibleName: optionalText(255),
    status: z.enum(ACTIVITY_STATUSES).default('SCHEDULED'),
    /** Save even though the schedule conflicts with another activity. */
    acknowledgeConflicts: z.boolean().optional().default(false),
  })
  .superRefine((d, ctx) => {
    if (d.endsAt <= d.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'The end must be after the start.' });
    else if (d.endsAt.getTime() - d.startsAt.getTime() > MAX_ACTIVITY_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'An activity can last at most 92 days.' });
    }
  });
export type ActivityInput = z.infer<typeof activitySchema>;

export const activityRangeSchema = z.object({
  from: dayKey,
  to: dayKey,
});
