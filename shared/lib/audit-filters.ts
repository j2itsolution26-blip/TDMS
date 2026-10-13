import type { AuditCategory, AuditSeverity } from './audit-events';

/**
 * The Audit Logs page's filters, and how they travel in the URL.
 *
 * Shared by the server (which parses and applies them) and the browser (which
 * builds links from them), so the two cannot disagree about a query string.
 * Pure: no database, no Node APIs.
 */

export const DATE_RANGES = ['all', 'today', 'yesterday', '7d', '30d', 'custom'] as const;
export type DateRange = (typeof DATE_RANGES)[number];

export interface AuditFilters {
  page: number;
  q: string | null;
  category: AuditCategory | null;
  severity: AuditSeverity | null;
  /** An email address: events this person performed or was the subject of. */
  user: string | null;
  range: DateRange;
  /** Day keys ("2026-09-28") for a custom range, inclusive. */
  from: string | null;
  to: string | null;
  includeTest: boolean;
}

const CATEGORIES: AuditCategory[] = [
  'authentication', 'password', 'access_code', 'admin_account', 'user_account', 'security', 'system', 'other',
];
const SEVERITIES: AuditSeverity[] = ['info', 'activity', 'warning', 'security'];

/** Parse and validate the page's query string. Anything unrecognised is ignored. */
export function parseAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (k: string) => {
    const v = params[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    return s ? s : null;
  };
  const page = Number(one('page') ?? 1);
  const category = one('category');
  const severity = one('severity');
  const range = one('range');
  const day = (k: string) => {
    const v = one(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  const user = one('user');
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    q: one('q')?.slice(0, 100) ?? null,
    category: category && (CATEGORIES as string[]).includes(category) ? (category as AuditCategory) : null,
    severity: severity && (SEVERITIES as string[]).includes(severity) ? (severity as AuditSeverity) : null,
    user: user && /^[^\s<>()]+@[^\s<>()]+$/.test(user) ? user.toLowerCase() : null,
    range: range && (DATE_RANGES as readonly string[]).includes(range) ? (range as DateRange) : 'all',
    from: day('from'),
    to: day('to'),
    includeTest: one('test') === '1',
  };
}

/** The same filters as a query string, for links, pagination and export. */
export function filtersToQuery(f: AuditFilters, overrides: Partial<AuditFilters> = {}): string {
  const m = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (m.q) p.set('q', m.q);
  if (m.category) p.set('category', m.category);
  if (m.severity) p.set('severity', m.severity);
  if (m.user) p.set('user', m.user);
  if (m.range !== 'all') p.set('range', m.range);
  if (m.range === 'custom' && m.from) p.set('from', m.from);
  if (m.range === 'custom' && m.to) p.set('to', m.to);
  if (m.includeTest) p.set('test', '1');
  if (m.page > 1) p.set('page', String(m.page));
  return p.toString();
}

