import { authorizePage, requireUser } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { requestHeaders } from '@/server/plugins/request-context';
import { idSchema } from '@/server/schemas/schemas';
import { reportFilterSchema, resultFilterSchema } from '@/server/schemas/assessment-center';
import { batchOptions, candidateHistory, getBatch, listResults, openBatches } from '@/server/services/assessment-center/batches';
import { listActivities } from '@/server/services/assessment-center/calendar';
import { assessorOptions, qualificationOptions, staffOptions } from '@/server/services/assessment-center/options';
import { auditReport, buildReport } from '@/server/services/assessment-center/reports';
import { localDayKey } from '@shared/lib/institution-time';
import type { PageRequest } from '@/server/controllers/pages/types';

/**
 * The TVET Assessment Center's screens: results monitoring, one batch, one
 * candidate's history, the training and assessment calendar, and the batch
 * result report (on screen and printable). Each checks its own policy here;
 * the sidebar only decides which links are shown.
 */

/** Filters from the query string; an unusable one is dropped rather than failing the page. */
function filtersFrom<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, query: Record<string, string | undefined>, fallback: T): T {
  const parsed = schema.safeParse(query);
  if (parsed.success) return parsed.data;
  const kept: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(query)) {
    const one = schema.safeParse({ ...kept, [k]: v });
    if (one.success) kept[k] = v;
  }
  const retry = schema.safeParse(kept);
  return retry.success ? retry.data : fallback;
}

/** /assessment/results */
export async function loadAssessmentResults({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(assessmentCenterPolicy.view(user));
  const filters = filtersFrom(resultFilterSchema, query, { page: 1 } as ReturnType<typeof resultFilterSchema.parse>);
  const [data, qualifications, assessors, batches] = await Promise.all([listResults(filters), qualificationOptions(), assessorOptions(), batchOptions()]);
  return {
    ...data,
    filters: Object.fromEntries(Object.entries(query).filter(([k, v]) => v && k !== 'page')),
    qualifications,
    assessors,
    batches,
    canManage: assessmentCenterPolicy.manageResults(user),
  };
}

/** /assessment/batches/:id */
export async function loadAssessmentBatch({ params }: PageRequest) {
  const user = await requireUser();
  authorizePage(assessmentCenterPolicy.view(user));
  const id = idSchema.parse(params.id);
  const data = await getBatch(id);
  const canManage = assessmentCenterPolicy.manageResults(user);
  const [reassessTargets, qualifications, assessors] = canManage
    ? await Promise.all([openBatches(BigInt(data.batch.program.id)), qualificationOptions(), assessorOptions()])
    : [[], [], []];
  return { ...data, reassessTargets: reassessTargets.filter((b) => b.id !== data.batch.id), qualifications, assessors, canManage };
}

/** /assessment/candidates/:id */
export async function loadAssessmentCandidate({ params }: PageRequest) {
  const user = await requireUser();
  authorizePage(assessmentCenterPolicy.view(user));
  return candidateHistory(idSchema.parse(params.id));
}

const VIEWS = ['month', 'week', 'agenda'] as const;
type CalendarView = (typeof VIEWS)[number];

function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The days a view shows around its anchor date. */
export function calendarRange(view: CalendarView, anchor: string): { from: string; to: string } {
  const d = new Date(`${anchor}T00:00:00Z`);
  if (view === 'week') {
    const from = addDays(anchor, -d.getUTCDay());
    return { from, to: addDays(from, 6) };
  }
  if (view === 'agenda') return { from: anchor, to: addDays(anchor, 29) };
  const first = `${anchor.slice(0, 7)}-01`;
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { from: addDays(first, -new Date(`${first}T00:00:00Z`).getUTCDay()), to: addDays(last, 6 - new Date(`${last}T00:00:00Z`).getUTCDay()) };
}

/** /assessment/calendar */
export async function loadAssessmentCalendar({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(assessmentCenterPolicy.viewCalendar(user));
  const today = localDayKey(new Date());
  const view: CalendarView = VIEWS.includes(query.view as CalendarView) ? (query.view as CalendarView) : 'month';
  const date = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) && !Number.isNaN(Date.parse(`${query.date}T00:00:00Z`)) ? query.date : today;
  const { from, to } = calendarRange(view, date);
  const DAY = 24 * 60 * 60 * 1000;
  const canManage = assessmentCenterPolicy.manageCalendar(user);
  const [activities, options] = await Promise.all([
    listActivities(new Date(Date.parse(`${from}T00:00:00Z`) - DAY), new Date(Date.parse(`${to}T00:00:00Z`) + 2 * DAY)),
    canManage ? Promise.all([qualificationOptions(), assessorOptions(), staffOptions(), batchOptions()]) : Promise.resolve(null),
  ]);
  return {
    view,
    date,
    today,
    from,
    to,
    activities,
    canManage,
    options: options ? { qualifications: options[0], assessors: options[1], staff: options[2], batches: options[3] } : null,
  };
}

/** /assessment/reports — the report on screen, with its filters. */
export async function loadAssessmentReports({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(assessmentCenterPolicy.viewReports(user));
  const filters = filtersFrom(reportFilterSchema, query, {} as ReturnType<typeof reportFilterSchema.parse>);
  const [report, qualifications, batches] = await Promise.all([buildReport(filters, user), qualificationOptions(), batchOptions()]);
  return { report, qualifications, batches, query: Object.fromEntries(Object.entries(query).filter(([, v]) => v)) };
}

/**
 * /assessment/reports/print — the printable report, outside the app shell.
 * Opening it is recorded in the audit log as the report being generated.
 */
export async function loadAssessmentReportPrint({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(assessmentCenterPolicy.viewReports(user));
  const filters = filtersFrom(reportFilterSchema, query, {} as ReturnType<typeof reportFilterSchema.parse>);
  const report = await buildReport(filters, user);
  const headers = requestHeaders();
  const forwarded = headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ?? null;
  const ua = headers['user-agent'];
  await auditReport('printed', report, user, { ip, userAgent: Array.isArray(ua) ? ua[0] : (ua ?? null) });
  return { report };
}
