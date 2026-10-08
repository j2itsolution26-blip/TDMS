import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import { ROLE_LABELS, type RoleName } from '@shared/types/domain';
import { diffForHumans } from '@shared/lib/dates';
import { institutionTimeZone, localDayKey, startOfLocalDay, dayKeyToStart } from '@shared/lib/institution-time';
import {
  describeEvent,
  codesInCategory,
  codesWithSeverity,
  codesMatching,
  adminActionCodes,
  knownCodes,
  parseParty,
  isTestAddress,
  formatDetails,
  highlights,
  redactedDetails,
  AUDIT_CATEGORY_LABELS,
  TEST_ADDRESS_FRAGMENTS,
  type AuditCategory,
  type AuditSeverity,
  type DetailField,
} from '@shared/lib/audit-events';
import type { AuditFilters } from '@shared/lib/audit-filters';
import { dashboardRoleLabel, personLine, type SummaryEvent, type SummaryTone } from '@shared/lib/audit-dashboard';

/**
 * Reading the audit trail, for the Super Admin's Audit Logs page and its
 * export. READ-ONLY: nothing here writes, rewrites or deletes an audit row.
 *
 * Every filter runs in SQL against one indexed table, one page at a time — 25
 * rows, never the whole log. The summary figures are COUNT queries. The drawer
 * uses the rows already on the page, so opening one costs no request.
 */

// --- Filters live in src/lib/audit-filters.ts (shared with the browser) --------------

function dateWindow(f: AuditFilters, now: Date): { gte?: Date; lt?: Date } | null {
  switch (f.range) {
    case 'today':
      return { gte: startOfLocalDay(now) };
    case 'yesterday':
      return { gte: startOfLocalDay(now, -1), lt: startOfLocalDay(now) };
    case '7d':
      return { gte: startOfLocalDay(now, -6) };
    case '30d':
      return { gte: startOfLocalDay(now, -29) };
    case 'custom': {
      const from = f.from ? dayKeyToStart(f.from) : null;
      const toStart = f.to ? dayKeyToStart(f.to) : null;
      // Inclusive of the "to" day: up to the start of the day after.
      const to = toStart ? startOfLocalDay(new Date(toStart.getTime() + 12 * 3_600_000), 1) : null;
      if (!from && !to) return null;
      return { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
    }
    default:
      return null;
  }
}

/** Rows involving a test address, excluded unless asked for. */
function notTest(): Prisma.AuditLogWhereInput {
  return {
    NOT: TEST_ADDRESS_FRAGMENTS.flatMap((fragment) => [
      { actor: { contains: fragment, mode: 'insensitive' as const } },
      { target: { contains: fragment, mode: 'insensitive' as const } },
    ]),
  };
}

function actionFilter(codes: string[], includeUnknown = false): Prisma.AuditLogWhereInput {
  return includeUnknown
    ? { OR: [{ action: { in: codes } }, { action: { notIn: knownCodes() } }] }
    : { action: { in: codes } };
}

function buildWhere(f: AuditFilters, now: Date): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (!f.includeTest) and.push(notTest());

  if (f.q) {
    const text = f.q;
    and.push({
      OR: [
        { actor: { contains: text, mode: 'insensitive' } },
        { target: { contains: text, mode: 'insensitive' } },
        { action: { contains: text.replace(/\s+/g, '_'), mode: 'insensitive' } },
        { action: { in: codesMatching(text) } },
      ],
    });
  }

  if (f.category) {
    and.push(
      f.category === 'other'
        ? { OR: [{ action: { in: codesInCategory('other') } }, { action: { notIn: knownCodes() } }] }
        : actionFilter(codesInCategory(f.category)),
    );
  }

  // An unknown code is shown as "activity", so filtering by activity finds it.
  if (f.severity) and.push(actionFilter(codesWithSeverity(f.severity), f.severity === 'activity'));

  if (f.user) {
    and.push({
      OR: [
        { actor: { contains: `<${f.user}>`, mode: 'insensitive' } },
        { target: { contains: `<${f.user}>`, mode: 'insensitive' } },
        { target: { contains: `(${f.user})`, mode: 'insensitive' } },
      ],
    });
  }

  const window = dateWindow(f, now);
  if (window) and.push({ createdAt: window });

  return and.length ? { AND: and } : {};
}

// --- Presentation --------------------------------------------------------------------

export interface AuditPartyView {
  name: string;
  email: string | null;
  /** The person's current role, when they still have an account. */
  role: string | null;
}

export interface AuditEventView {
  id: string;
  code: string;
  label: string;
  category: AuditCategory;
  categoryLabel: string;
  severity: AuditSeverity;
  actor: AuditPartyView;
  target: AuditPartyView;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  /** All labels computed on the server, in the institution's timezone. */
  timeLabel: string;
  dateTimeLabel: string;
  relative: string;
  dayKey: string;
  dayLabel: string;
  highlights: DetailField[];
  fields: DetailField[];
  /** Stored details with any secret-shaped value masked, for "View technical details". */
  technical: string | null;
  isTest: boolean;
}

const ROLE_ORDER: RoleName[] = ['super_admin', 'admin', 'director', 'coordinator', 'secretary', 'teacher', 'student'];

/** Each address's account as it is now — current name and most senior role — in two queries. */
async function peopleByEmail(emails: string[]): Promise<Map<string, { name: string; role: RoleName | null }>> {
  const unique = [...new Set(emails.map((e) => e.toLowerCase()))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { email: { in: unique, mode: 'insensitive' } },
    select: { id: true, email: true, name: true },
  });
  if (users.length === 0) return new Map();
  const assignments = await prisma.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, modelId: { in: users.map((u) => u.id) } },
    select: { modelId: true, role: { select: { name: true, guardName: true } } },
  });
  const byUser = new Map<string, string[]>();
  for (const a of assignments) {
    if (a.role.guardName !== GUARD) continue;
    const list = byUser.get(a.modelId.toString()) ?? [];
    list.push(a.role.name);
    byUser.set(a.modelId.toString(), list);
  }
  const out = new Map<string, { name: string; role: RoleName | null }>();
  for (const u of users) {
    const roles = byUser.get(u.id.toString()) ?? [];
    out.set(u.email.toLowerCase(), { name: u.name, role: ROLE_ORDER.find((r) => roles.includes(r)) ?? null });
  }
  return out;
}

/** Current role of each address on the page. */
async function rolesFor(emails: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const [email, person] of await peopleByEmail(emails)) {
    if (person.role) out.set(email, ROLE_LABELS[person.role]);
  }
  return out;
}

function makeFormatters(tz: string, now: Date) {
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const date = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long', day: 'numeric', year: 'numeric' });
  const todayKey = localDayKey(now, tz);
  const yesterdayKey = localDayKey(new Date(startOfLocalDay(now, -1, tz).getTime() + 12 * 3_600_000), tz);
  const dateTime = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : `${date.format(d)} · ${time.format(d)}`;
  };
  return {
    time: (d: Date) => time.format(d),
    dateTime,
    dayLabel: (key: string, d: Date) => (key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : date.format(d)),
  };
}

type AuditRow = {
  id: bigint;
  action: string;
  actor: string;
  target: string;
  ipAddress: string | null;
  userAgent: string | null;
  details: Prisma.JsonValue | null;
  createdAt: Date;
};

async function present(rows: AuditRow[], now: Date): Promise<AuditEventView[]> {
  const tz = institutionTimeZone();
  const fmt = makeFormatters(tz, now);
  const parties = rows.map((r) => ({ actor: parseParty(r.actor), target: parseParty(r.target) }));
  const roles = await rolesFor(
    parties.flatMap((p) => [p.actor.email, p.target.email]).filter((e): e is string => Boolean(e)),
  );
  const view = (p: ReturnType<typeof parseParty>): AuditPartyView => ({
    name: p.name,
    email: p.email,
    role: p.email ? (roles.get(p.email.toLowerCase()) ?? null) : null,
  });

  return rows.map((r, i) => {
    const event = describeEvent(r.action);
    const details = (r.details && typeof r.details === 'object' && !Array.isArray(r.details)
      ? (r.details as Record<string, unknown>)
      : null);
    const key = localDayKey(r.createdAt, tz);
    const technical = redactedDetails(details);
    return {
      id: r.id.toString(),
      code: r.action,
      label: event.label,
      category: event.category,
      categoryLabel: AUDIT_CATEGORY_LABELS[event.category],
      severity: event.severity,
      actor: view(parties[i]!.actor),
      target: view(parties[i]!.target),
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
      timeLabel: fmt.time(r.createdAt),
      dateTimeLabel: fmt.dateTime(r.createdAt.toISOString()),
      relative: diffForHumans(r.createdAt, now),
      dayKey: key,
      dayLabel: fmt.dayLabel(key, r.createdAt),
      highlights: highlights(details, fmt.dateTime),
      fields: formatDetails(details, fmt.dateTime),
      technical: technical ? JSON.stringify(technical, null, 2) : null,
      isTest: isTestAddress(parties[i]!.actor.email) || isTestAddress(parties[i]!.target.email),
    };
  });
}

// --- The page ----------------------------------------------------------------------

export const AUDIT_PAGE_SIZE = 25;

export interface AuditLogPage {
  events: AuditEventView[];
  metrics: { total: number; today: number; security: number; adminActions: number };
  users: { email: string; name: string }[];
  page: number;
  lastPage: number;
  total: number;
  /** Whether any event exists at all (distinguishes "no matches" from "nothing yet"). */
  anyEvents: boolean;
  /** How many events the "test events" switch is currently hiding. */
  hiddenTestEvents: number;
}

export async function listAuditLogs(f: AuditFilters, now = new Date()): Promise<AuditLogPage> {
  const where = buildWhere(f, now);
  const base: Prisma.AuditLogWhereInput = f.includeTest ? {} : notTest();

  const [total, rows, all, everything, today, security, adminActions, actors, targets] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (f.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    prisma.auditLog.count({ where: base }),
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { AND: [base, { createdAt: { gte: startOfLocalDay(now) } }] } }),
    prisma.auditLog.count({ where: { AND: [base, { action: { in: codesWithSeverity('security') } }] } }),
    prisma.auditLog.count({ where: { AND: [base, { action: { in: adminActionCodes() } }] } }),
    prisma.auditLog.findMany({ where: base, distinct: ['actor'], select: { actor: true }, take: 300 }),
    prisma.auditLog.findMany({ where: base, distinct: ['target'], select: { target: true }, take: 300 }),
  ]);

  // Everybody who appears in the log, as either side, once each.
  const people = new Map<string, string>();
  for (const raw of [...actors.map((a) => a.actor), ...targets.map((t) => t.target)]) {
    const p = parseParty(raw);
    if (!p.email) continue;
    if (!f.includeTest && isTestAddress(p.email)) continue;
    if (!people.has(p.email.toLowerCase())) people.set(p.email.toLowerCase(), p.name);
  }

  return {
    events: await present(rows, now),
    metrics: { total: all, today, security, adminActions },
    users: [...people.entries()]
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    page: f.page,
    lastPage: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    total,
    anyEvents: everything > 0,
    hiddenTestEvents: f.includeTest ? 0 : everything - all,
  };
}

// --- Dashboard summary -----------------------------------------------------------------

export interface SummaryEventView {
  id: string;
  label: string;
  /** "James Tan · Administrator" — a name and a role, never an address or an id. */
  person: string;
  at: string;
  status?: { tone: SummaryTone; label: string };
}

/**
 * The few most recent events of one dashboard panel, as the dashboard shows
 * them: a readable event, the person it concerns by their CURRENT account
 * name and role, and when. No address, code, id or stored detail leaves this
 * function — those stay on the Audit Logs page.
 *
 * Test rows are left out by the same rule the Audit Logs page uses (reserved
 * test domains, the e2e- prefix), in SQL and again in code.
 */
export async function recentSummaryEvents(
  events: Record<string, SummaryEvent>,
  take = 6,
): Promise<SummaryEventView[]> {
  const rows = await prisma.auditLog.findMany({
    where: { AND: [notTest(), { action: { in: Object.keys(events) } }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    // A little headroom for rows the in-code test check drops.
    take: take * 2,
    select: { id: true, action: true, actor: true, target: true, createdAt: true },
  });

  const parsed = rows
    .map((r) => ({ r, actor: parseParty(r.actor), target: parseParty(r.target) }))
    .filter((p) => !isTestAddress(p.actor.email) && !isTestAddress(p.target.email))
    .slice(0, take);

  const people = await peopleByEmail(
    parsed.flatMap((p) => [p.actor.email, p.target.email]).filter((e): e is string => Boolean(e)),
  );

  return parsed.map(({ r, actor, target }) => {
    const meta = events[r.action]!;
    // The named side, or the other when the named side is not a person ("Audit log").
    let party = meta.subject === 'actor' ? actor : target;
    if (!party.email) {
      const other = meta.subject === 'actor' ? target : actor;
      if (other.email) party = other;
    }
    const account = party.email ? people.get(party.email.toLowerCase()) : undefined;
    // The account's name today; the name recorded at the time if it has gone.
    // Never an address: a row that only ever held one reads "Unknown account".
    const stored = party.name.includes('@') ? 'Unknown account' : party.name;
    const name = account?.name ?? stored;
    return {
      id: r.id.toString(),
      label: meta.label,
      person: personLine(name, dashboardRoleLabel(account?.role ?? null)),
      at: r.createdAt.toISOString(),
      ...(meta.status ? { status: meta.status } : {}),
    };
  });
}

// --- Export ------------------------------------------------------------------------

/** Rows per export. Enough for any realistic review; a hard stop on runaway size. */
export const EXPORT_LIMIT = 10_000;

export async function exportAuditLogs(f: AuditFilters, now = new Date()) {
  const where = buildWhere(f, now);
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: EXPORT_LIMIT }),
  ]);
  return { total, truncated: total > rows.length, events: await present(rows, now) };
}
