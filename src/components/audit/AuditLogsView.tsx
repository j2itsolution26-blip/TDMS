'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Drawer from '@/components/Drawer';
import { filtersToQuery, type AuditFilters, type DateRange } from '@/lib/audit-filters';
import type { AuditCategory, AuditSeverity, DetailField } from '@/lib/audit-events';

/**
 * Super Admin → Audit Logs.
 *
 * Everything on this screen comes from the server in one response: 25 events,
 * already labelled, grouped by day in the institution's timezone, with their
 * details formatted. Opening an event's details reads from those rows — no
 * request per row, no request per click. Filters and pages are ordinary URLs,
 * so a filtered view can be bookmarked or shared, and Back works.
 */

// --- Types mirrored from the server (plain data, safe to serialise) ----------------

export interface PartyView {
  name: string;
  email: string | null;
  role: string | null;
}

export interface EventView {
  id: string;
  code: string;
  label: string;
  category: AuditCategory;
  categoryLabel: string;
  severity: AuditSeverity;
  actor: PartyView;
  target: PartyView;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  timeLabel: string;
  dateTimeLabel: string;
  relative: string;
  dayKey: string;
  dayLabel: string;
  highlights: DetailField[];
  fields: DetailField[];
  technical: string | null;
  isTest: boolean;
}

export interface AuditPageData {
  events: EventView[];
  metrics: { total: number; today: number; security: number; adminActions: number };
  users: { email: string; name: string }[];
  page: number;
  lastPage: number;
  total: number;
  anyEvents: boolean;
  hiddenTestEvents: number;
}

// --- Severity: icon + word, never colour alone -------------------------------------

const SEVERITY: Record<AuditSeverity, { label: string; badge: string; icon: string; dot: string }> = {
  security: {
    label: 'Security',
    badge: 'bg-red-50 text-red-800 ring-red-600/20',
    dot: 'bg-red-50 text-red-700',
    icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  },
  warning: {
    label: 'Warning',
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    dot: 'bg-amber-50 text-amber-700',
    icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  },
  activity: {
    label: 'Activity',
    badge: 'bg-primary-50 text-primary-800 ring-primary-600/20',
    dot: 'bg-primary-50 text-primary-700',
    icon: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
  },
  info: {
    label: 'Info',
    badge: 'bg-blue-50 text-blue-800 ring-blue-600/20',
    dot: 'bg-blue-50 text-blue-700',
    icon: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z',
  },
};

function Icon({ d, className = 'h-4 w-4' }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  const s = SEVERITY[severity];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.badge}`}>
      <Icon d={s.icon} className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';
const FIELD =
  'block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30';

const RANGE_LABELS: Record<DateRange, string> = {
  all: 'Any time',
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  custom: 'Custom range',
};

// --- The page ----------------------------------------------------------------------

export default function AuditLogsView({
  data,
  filters,
  categories,
  severities,
}: {
  data: AuditPageData;
  filters: AuditFilters;
  categories: { value: AuditCategory; label: string }[];
  severities: { value: AuditSeverity; label: string; description: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<AuditFilters>(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<EventView | null>(null);

  function go(next: AuditFilters) {
    const qs = filtersToQuery({ ...next, page: 1 });
    startTransition(() => router.push(qs ? `/audit-logs?${qs}` : '/audit-logs'));
  }

  function set<K extends keyof AuditFilters>(key: K, value: AuditFilters[K], apply = true) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    // Selects apply at once on wide screens; the phone drawer waits for Apply.
    if (apply && !filtersOpen) go(next);
  }

  const activeCount = [draft.category, draft.severity, draft.user, draft.range !== 'all' ? 'r' : null, draft.includeTest ? 't' : null].filter(Boolean).length;
  const filtered = Boolean(filters.q || filters.category || filters.severity || filters.user || filters.range !== 'all');

  const groups = useMemo(() => {
    const out: { key: string; label: string; events: EventView[] }[] = [];
    for (const e of data.events) {
      const last = out[out.length - 1];
      if (last && last.key === e.dayKey) last.events.push(e);
      else out.push({ key: e.dayKey, label: e.dayLabel, events: [e] });
    }
    return out;
  }, [data.events]);

  const exportHref = `/api/audit-logs/export${filtersToQuery({ ...filters, page: 1 }) ? `?${filtersToQuery({ ...filters, page: 1 })}` : ''}`;
  const first = data.total === 0 ? 0 : (data.page - 1) * 25 + 1;
  const last = Math.min(data.page * 25, data.total);

  const filterFields = (
    <>
      <label className="block">
        <span className="sr-only sm:not-sr-only sm:mb-1 sm:block sm:text-xs sm:font-medium sm:text-muted lg:sr-only">Action</span>
        <select aria-label="Action" className={FIELD} value={draft.category ?? ''} onChange={(e) => set('category', (e.target.value || null) as AuditCategory | null)}>
          <option value="">All actions</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only sm:not-sr-only sm:mb-1 sm:block sm:text-xs sm:font-medium sm:text-muted lg:sr-only">User</span>
        <select aria-label="User" className={FIELD} value={draft.user ?? ''} onChange={(e) => set('user', e.target.value || null)}>
          <option value="">All users</option>
          {data.users.map((u) => (
            <option key={u.email} value={u.email}>{u.name} — {u.email}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only sm:not-sr-only sm:mb-1 sm:block sm:text-xs sm:font-medium sm:text-muted lg:sr-only">Severity</span>
        <select aria-label="Severity" className={FIELD} value={draft.severity ?? ''} onChange={(e) => set('severity', (e.target.value || null) as AuditSeverity | null)}>
          <option value="">All severities</option>
          {severities.map((s) => (
            <option key={s.value} value={s.value}>{s.label} — {s.description}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only sm:not-sr-only sm:mb-1 sm:block sm:text-xs sm:font-medium sm:text-muted lg:sr-only">Date</span>
        <select aria-label="Date" className={FIELD} value={draft.range} onChange={(e) => set('range', e.target.value as DateRange, e.target.value !== 'custom')}>
          {(Object.keys(RANGE_LABELS) as DateRange[]).map((r) => (
            <option key={r} value={r}>{RANGE_LABELS[r]}</option>
          ))}
        </select>
      </label>
    </>
  );

  const customRange = draft.range === 'custom' && (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-medium text-muted">
        From
        <input type="date" className={`${FIELD} mt-1`} value={draft.from ?? ''} onChange={(e) => set('from', e.target.value || null, false)} />
      </label>
      <label className="text-xs font-medium text-muted">
        To
        <input type="date" className={`${FIELD} mt-1`} value={draft.to ?? ''} onChange={(e) => set('to', e.target.value || null, false)} />
      </label>
      {!filtersOpen && (
        <button type="button" onClick={() => go(draft)} className={`rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 ${FOCUS}`}>
          Apply dates
        </button>
      )}
    </div>
  );

  const testToggle = (
    <label className="inline-flex items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-600"
        checked={draft.includeTest}
        onChange={(e) => set('includeTest', e.target.checked)}
      />
      Include test events
    </label>
  );

  return (
    <div className="space-y-6" aria-busy={pending}>
      {/* --- Header ------------------------------------------------------ */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-ink sm:text-[28px]">Audit Logs</h1>
          <p className="mt-1 text-sm text-muted">Monitor system activity, security events, and administrative changes.</p>
        </div>
        {data.anyEvents && (
          <a
            href={exportHref}
            className={`inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-ink shadow-sm hover:border-primary-200 hover:bg-primary-50 ${FOCUS}`}
          >
            <Icon d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            Export
            <span className="sr-only"> the events matching the current filters as CSV</span>
          </a>
        )}
      </header>

      {/* --- Summary --------------------------------------------------- */}
      <ul aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total Events', value: data.metrics.total, hint: 'All recorded activity' },
          { label: "Today's Events", value: data.metrics.today, hint: 'Since midnight' },
          { label: 'Security Events', value: data.metrics.security, hint: 'Changes to who can get in' },
          { label: 'Admin Actions', value: data.metrics.adminActions, hint: 'Account and credential changes' },
        ].map((m) => (
          <li key={m.label} className="rounded-xl border border-border bg-card px-4 py-3 shadow-card">
            <p className="text-sm text-muted">{m.label}</p>
            <p className="mt-0.5 text-2xl font-semibold text-ink tabular-nums">{m.value.toLocaleString('en-US')}</p>
            <p className="text-xs text-muted">{m.hint}</p>
          </li>
        ))}
      </ul>

      {/* --- Toolbar --------------------------------------------------- */}
      <section aria-label="Search and filters" className="rounded-xl border border-border bg-card p-3 shadow-card">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go(draft);
          }}
          className="flex flex-col gap-3 lg:flex-row lg:items-center"
        >
          <div className="flex min-w-0 flex-1 gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search activity</span>
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
                <Icon d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </span>
              <input
                type="search"
                className={`${FIELD} pl-9`}
                placeholder="Search activity — name, email, event"
                value={draft.q ?? ''}
                onChange={(e) => setDraft({ ...draft, q: e.target.value || null })}
              />
            </label>
            {/* Phones: one button opens the filters as a drawer. */}
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-ink lg:hidden ${FOCUS}`}
            >
              <Icon d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              Filters{activeCount > 0 && <span className="rounded-full bg-primary-600 px-1.5 text-xs text-white">{activeCount}</span>}
            </button>
          </div>
          <div className="hidden gap-2 lg:grid lg:grid-cols-4 lg:[&>label]:w-44">{filterFields}</div>
          {filtered && (
            <Link href={draft.includeTest ? '/audit-logs?test=1' : '/audit-logs'} className={`hidden shrink-0 rounded text-sm font-medium text-primary-700 hover:underline lg:block ${FOCUS}`}>
              Clear filters
            </Link>
          )}
        </form>
        <div className="mt-3 hidden flex-wrap items-center justify-between gap-3 border-t border-border pt-3 lg:flex">
          {customRange || <span />}
          <div className="flex items-center gap-4">
            {data.hiddenTestEvents > 0 && !filters.includeTest && (
              <span className="text-xs text-muted">{data.hiddenTestEvents.toLocaleString('en-US')} test events hidden</span>
            )}
            {testToggle}
          </div>
        </div>
      </section>

      <Drawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <div className="flex justify-between gap-3">
            <Link href="/audit-logs" onClick={() => setFiltersOpen(false)} className={`rounded-lg px-3 py-2 text-sm font-medium text-primary-700 ${FOCUS}`}>
              Clear filters
            </Link>
            <button
              type="button"
              onClick={() => {
                setFiltersOpen(false);
                go(draft);
              }}
              className={`rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 ${FOCUS}`}
            >
              Apply
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {filterFields}
          {customRange}
          {testToggle}
          {data.hiddenTestEvents > 0 && !filters.includeTest && (
            <p className="text-xs text-muted">{data.hiddenTestEvents.toLocaleString('en-US')} test events are hidden.</p>
          )}
        </div>
      </Drawer>

      {/* --- Events ---------------------------------------------------- */}
      {data.events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <p className="text-base font-semibold text-ink">{data.anyEvents ? 'No events match these filters' : 'No activity recorded yet'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            {data.anyEvents
              ? 'Try a wider date range, another action or user, or clear the filters.'
              : 'System activity and security events will appear here as users interact with TDMS.'}
          </p>
          {data.anyEvents && (
            <Link href="/audit-logs" className={`mt-4 inline-block rounded text-sm font-medium text-primary-700 hover:underline ${FOCUS}`}>
              Clear filters
            </Link>
          )}
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity ${pending ? 'opacity-60' : ''}`}>
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`day-${group.key}`}>
              <h2 id={`day-${group.key}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {group.label}
              </h2>
              <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
                {group.events.map((e) => (
                  <EventRow key={e.id} event={e} onOpen={() => setSelected(e)} />
                ))}
              </ol>
            </section>
          ))}

          {/* --- Pagination ------------------------------------------- */}
          <nav aria-label="Pagination" className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-muted">
              Showing <span className="font-medium text-ink">{first.toLocaleString('en-US')}–{last.toLocaleString('en-US')}</span> of{' '}
              <span className="font-medium text-ink">{data.total.toLocaleString('en-US')}</span> events
            </p>
            <Pager page={data.page} lastPage={data.lastPage} hrefFor={(p) => {
              const qs = filtersToQuery({ ...filters, page: p });
              return qs ? `/audit-logs?${qs}` : '/audit-logs';
            }} />
          </nav>
        </div>
      )}

      <Drawer open={selected !== null} onClose={() => setSelected(null)} title="Event details" width="sm:max-w-lg">
        {selected && <EventDetails event={selected} />}
      </Drawer>
    </div>
  );
}

// --- One event row -------------------------------------------------------------------

function EventRow({ event: e, onOpen }: { event: EventView; onOpen: () => void }) {
  const s = SEVERITY[e.severity];
  const self = e.actor.email && e.actor.email === e.target.email;
  return (
    <li>
      <article className="flex gap-3 px-4 py-3.5 sm:px-5" aria-labelledby={`ev-${e.id}`}>
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${s.dot}`}>
          <Icon d={s.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 id={`ev-${e.id}`} className="text-sm font-semibold text-ink">{e.label}</h3>
            <SeverityBadge severity={e.severity} />
            {e.isTest && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">Test</span>}
            <time dateTime={e.createdAt} title={e.dateTimeLabel} className="ml-auto text-xs text-muted">
              {e.relative}
            </time>
          </div>

          <p className="mt-1 truncate text-sm text-ink">
            {e.target.name}
            {e.target.email && <span className="text-muted"> · {e.target.email}</span>}
            {e.target.role && <span className="text-muted"> · {e.target.role}</span>}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {self ? 'By the account holder' : (
              <>Performed by <span className="font-medium text-ink">{e.actor.name}</span>{e.actor.role && ` · ${e.actor.role}`}</>
            )}
          </p>

          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <dl className="flex flex-wrap gap-x-5 gap-y-1">
              {e.highlights.map((h) => (
                <div key={h.key} className="text-xs">
                  <dt className="text-muted">{h.label}</dt>
                  <dd className="font-medium text-ink">{h.value}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              onClick={onOpen}
              className={`ml-auto shrink-0 rounded text-sm font-medium text-primary-700 hover:text-primary-800 hover:underline ${FOCUS}`}
            >
              View details<span aria-hidden="true"> →</span>
              <span className="sr-only">: {e.label}, {e.dateTimeLabel}</span>
            </button>
          </div>
        </div>
      </article>
    </li>
  );
}

// --- The details drawer --------------------------------------------------------------

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

function Person({ party }: { party: PartyView }) {
  return (
    <>
      <span className="block font-medium">{party.name}</span>
      {party.email && <span className="block break-all text-muted">{party.email}</span>}
      {party.role && <span className="block text-muted">{party.role}</span>}
    </>
  );
}

function EventDetails({ event: e }: { event: EventView }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(e.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-lg font-semibold text-ink">{e.label}</p>
        <SeverityBadge severity={e.severity} />
        {e.isTest && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">Test</span>}
      </div>

      <dl className="mt-2 divide-y divide-border">
        <Section label="Event">
          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs">{e.code}</code>
          <span className="ml-2 text-muted">{e.categoryLabel}</span>
        </Section>
        <Section label="Date & time">{e.dateTimeLabel}</Section>
        <Section label="Performed by"><Person party={e.actor} /></Section>
        <Section label="Target"><Person party={e.target} /></Section>
        {e.fields.length > 0 && (
          <Section label="Details">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              {e.fields.map((f) => (
                <div key={f.key}>
                  <dt className="text-xs text-muted">{f.label}</dt>
                  <dd className="break-words font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}
        {(e.ipAddress || e.userAgent) && (
          <Section label="Source">
            {e.ipAddress && <span className="block">IP address {e.ipAddress}</span>}
            {e.userAgent && <span className="block break-words text-xs text-muted">{e.userAgent}</span>}
          </Section>
        )}
        <Section label="Event ID">
          <span className="flex items-center gap-3">
            <code className="font-mono text-xs">{e.id}</code>
            <button type="button" onClick={copy} className={`rounded text-sm font-medium text-primary-700 hover:underline ${FOCUS}`}>
              {copied ? 'Copied' : 'Copy event ID'}
            </button>
          </span>
        </Section>
      </dl>

      {e.technical && (
        <details className="mt-2 rounded-lg border border-border">
          <summary className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-ink ${FOCUS}`}>View technical details</summary>
          <pre className="overflow-x-auto border-t border-border bg-surface px-3 py-2 text-xs text-ink">{e.technical}</pre>
        </details>
      )}
    </div>
  );
}

// --- Pagination -----------------------------------------------------------------------

function pageList(page: number, last: number): (number | 'gap')[] {
  const pages = new Set([1, last, page - 1, page, page + 1].filter((p) => p >= 1 && p <= last));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

function Pager({ page, lastPage, hrefFor }: { page: number; lastPage: number; hrefFor: (p: number) => string }) {
  if (lastPage <= 1) return null;
  const base = `inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm ${FOCUS}`;
  const idle = 'border-border bg-card text-ink hover:bg-surface';
  return (
    <ul className="flex flex-wrap items-center gap-1">
      <li>
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={`${base} ${idle}`}>Previous</Link>
        ) : (
          <span className={`${base} border-border text-muted opacity-50`} aria-disabled="true">Previous</span>
        )}
      </li>
      {pageList(page, lastPage).map((p, i) =>
        p === 'gap' ? (
          <li key={`gap-${i}`} className="px-1 text-muted" aria-hidden="true">…</li>
        ) : (
          <li key={p}>
            <Link
              href={hrefFor(p)}
              aria-current={p === page ? 'page' : undefined}
              aria-label={`Page ${p}`}
              className={`${base} ${p === page ? 'border-primary-600 bg-primary-600 font-medium text-white' : idle}`}
            >
              {p}
            </Link>
          </li>
        ),
      )}
      <li>
        {page < lastPage ? (
          <Link href={hrefFor(page + 1)} className={`${base} ${idle}`}>Next</Link>
        ) : (
          <span className={`${base} border-border text-muted opacity-50`} aria-disabled="true">Next</span>
        )}
      </li>
    </ul>
  );
}
