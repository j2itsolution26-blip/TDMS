import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from '@/lib/link';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { diffForHumans } from '@shared/lib/dates';
import { OVERDUE_DAYS, daysWaiting, queueTabs, waitingLabel, type QueueGroup } from '@shared/lib/work-queue';
import type { EnrollmentByProgramRow, ListItem, UpcomingEvent, WorkIcon, WorkItem, WorkMetric, WorkSegment } from '@shared/types/dashboard';
import { ACCENT, EmptyState, FOCUS, Glyph, TONE, WORK_ICONS, accentOf } from './RoleDashboardParts';

/**
 * The Secretary's workspace parts — "Fluent Emerald Enterprise".
 *
 * Built on the same tokens as the other role dashboards (white surfaces on the
 * green-grey canvas, hairline borders, one card shadow) but quieter: no
 * gradient washes, no decorative accent bars, no hover lifts. Colour is spent
 * only where it means something — work waiting (amber), something overdue or
 * refused (red), done (green) — and always next to a word, never alone.
 *
 * The banner above them is the shared WelcomeBanner.
 */

const STROKE = 1.9;
const nf = (n: number) => n.toLocaleString('en-US');

// --- Key figures ----------------------------------------------------------------------------

function KpiTile({ metric }: { metric: WorkMetric }) {
  const waiting = metric.tone === 'attention' && metric.value > 0;
  const accent = ACCENT[accentOf(metric)];
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${accent.tile}`}>
          <Glyph icon={metric.icon} className="h-[18px] w-[18px]" />
        </span>
        {metric.href && <ChevronRight className="h-4 w-4 text-tdms-muted transition-colors group-hover:text-tdms-text" strokeWidth={STROKE} aria-hidden="true" />}
      </span>
      <span className="mt-3 block text-[13px] font-medium text-tdms-muted">{metric.label}</span>
      <span className="mt-1 block text-[28px] font-bold leading-none tracking-[-0.02em] text-tdms-ink tabular-nums">{nf(metric.value)}</span>
      <span className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${waiting ? 'text-amber-800' : 'text-tdms-muted'}`}>
        {waiting && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />}
        {metric.hint}
      </span>
    </>
  );
  const box = 'group block h-full rounded-xl border border-tdms-hairline bg-white p-4 shadow-card';
  return metric.href ? (
    <Link href={metric.href} className={`${box} transition-[border-color,box-shadow] hover:border-primary-200 hover:shadow-card-hover ${FOCUS}`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

export function KpiTiles({ metrics }: { metrics: WorkMetric[] }) {
  if (metrics.length === 0) return null;
  return (
    <ul aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 2xl:grid-cols-6">
      {metrics.map((m) => (
        <li key={m.key} className="min-w-0">
          <KpiTile metric={m} />
        </li>
      ))}
    </ul>
  );
}

// --- Panel ----------------------------------------------------------------------------------

export function Panel({
  id,
  title,
  description,
  action,
  flush = false,
  children,
  className = '',
}: {
  id: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  /** Content runs edge to edge (a table), without the panel's padding. */
  flush?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className={`flex min-w-0 flex-col rounded-xl border border-tdms-hairline bg-white shadow-card ${className}`}>
      <header className="flex items-start justify-between gap-3 border-b border-tdms-hairline px-5 py-4">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-[15px] font-bold tracking-[-0.01em] text-tdms-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[13px] text-tdms-muted">{description}</p>}
        </div>
        {action && (
          <Link
            href={action.href}
            className={`inline-flex shrink-0 items-center gap-1 rounded-lg border border-tdms-hairline px-3 py-1.5 text-[13px] font-semibold text-tdms-ink transition-colors hover:bg-tdms-bg ${FOCUS}`}
          >
            {action.label}
            <span className="sr-only"> — {title}</span>
          </Link>
        )}
      </header>
      <div className={flush ? 'flex-1' : 'flex-1 px-5 py-4'}>{children}</div>
    </section>
  );
}

// --- Work queue -----------------------------------------------------------------------------

function QueueRow({ item, now }: { item: WorkItem; now: Date }) {
  const waiting = item.count > 0;
  const days = waiting ? daysWaiting(item.oldestAt, now) : null;
  const overdue = days !== null && days >= OVERDUE_DAYS;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3.5 sm:flex-nowrap">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${waiting ? 'bg-amber-50 text-amber-700' : 'bg-tdms-bg text-tdms-muted'}`}>
        <Glyph icon={item.icon} className="h-5 w-5" />
      </span>
      {/* On a phone the text takes the row and the count and button wrap beneath it. */}
      <span className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-auto">
        <span className="block text-sm font-semibold text-tdms-ink">{item.label}</span>
        <span className="block text-xs text-tdms-muted">{item.description}</span>
        {days !== null && (
          <span className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${overdue ? 'text-red-700' : 'text-tdms-muted'}`}>
            {overdue && <AlertTriangle className="h-3.5 w-3.5" strokeWidth={STROKE} aria-hidden="true" />}
            {overdue && <span className="sr-only">Overdue: </span>}
            {waitingLabel(days)}
          </span>
        )}
      </span>
      <span className="ml-[3.25rem] flex items-center gap-3 sm:ml-0">
        {waiting ? (
          <span className="inline-flex min-w-[5.5rem] justify-center whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 tabular-nums">
            {nf(item.count)} pending
          </span>
        ) : (
          <span className="inline-flex min-w-[5.5rem] items-center justify-center gap-1 whitespace-nowrap rounded-full bg-tdms-bg px-2.5 py-1 text-xs font-semibold text-tdms-muted">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={STROKE} aria-hidden="true" />
            Clear
          </span>
        )}
        <Link
          href={item.href}
          aria-label={`${item.action}: ${item.label}${waiting ? ` (${item.count} pending)` : ''}`}
          className={`inline-flex shrink-0 items-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${FOCUS} ${
            waiting ? 'border-primary-600 bg-primary-600 text-white hover:bg-primary-700' : 'border-tdms-hairline bg-white text-tdms-ink hover:bg-tdms-bg'
          }`}
        >
          {item.action}
        </Link>
      </span>
    </li>
  );
}

/** The office's waiting work, in tabs by stream. The tabs filter rows already loaded. */
export function WorkQueue({ items }: { items: WorkItem[] }) {
  const baseId = useId();
  const tabs = queueTabs(items.map((i) => ({ group: i.group ?? 'records', count: i.count })));
  const [active, setActive] = useState<'all' | QueueGroup>('all');
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [now] = useState(() => new Date());
  const shown = active === 'all' ? items : items.filter((i) => (i.group ?? 'records') === active);
  const waiting = tabs[0]!.count;

  // Arrow keys move between tabs (WAI-ARIA tabs, automatic activation).
  function onKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next = e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(tabs[next]!.key);
    refs.current[next]?.focus();
  }

  return (
    <Panel
      id="work-queue"
      title="Work Queue"
      description={waiting > 0 ? `${nf(waiting)} ${waiting === 1 ? 'item needs' : 'items need'} the office’s attention` : 'Everything is processed'}
      className="h-full"
    >
      {tabs.length > 2 && (
        <div role="tablist" aria-label="Work queue streams" className="-mx-1 mb-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {tabs.map((t, i) => {
            const selected = t.key === active;
            return (
              <button
                key={t.key}
                ref={(el) => { refs.current[i] = el; }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${t.key}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(t.key)}
                onKeyDown={(e) => onKey(e, i)}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${FOCUS} ${
                  selected ? 'bg-primary-600 text-white' : 'text-tdms-muted hover:bg-tdms-bg hover:text-tdms-ink'
                }`}
              >
                {t.label}
                <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${selected ? 'bg-[#fff]/20 text-white' : 'bg-tdms-bg text-tdms-muted'}`}>{nf(t.count)}</span>
              </button>
            );
          })}
        </div>
      )}
      <div
        id={`${baseId}-panel`}
        role={tabs.length > 2 ? 'tabpanel' : undefined}
        aria-labelledby={tabs.length > 2 ? `${baseId}-tab-${active}` : undefined}
      >
        <ul className="divide-y divide-tdms-hairline">
          {shown.map((item) => (
            <QueueRow key={item.key} item={item} now={now} />
          ))}
        </ul>
      </div>
    </Panel>
  );
}

// --- Activity -------------------------------------------------------------------------------

const timeFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export function ActivityFeed({ items }: { items: ListItem[] }) {
  if (items.length === 0) {
    return <EmptyState icon="records" title="No recent activity" description="Registrations, applications, enrollment changes and verified documents will appear here." />;
  }
  return (
    <ul className="-my-1 divide-y divide-tdms-hairline">
      {items.map((item) => {
        const at = item.at ? new Date(item.at) : null;
        const valid = at && !Number.isNaN(at.getTime());
        const body = (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tdms-wash text-primary-700">
              <Glyph icon={item.icon && item.icon in WORK_ICONS ? (item.icon as WorkIcon) : 'records'} className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-tdms-ink">{item.title}</span>
              {item.subtitle && <span className="block truncate text-xs text-tdms-muted">{item.subtitle}</span>}
            </span>
            {valid && (
              <time dateTime={item.at} title={timeFormat.format(at)} className="shrink-0 text-right text-xs tabular-nums text-tdms-muted">
                <span className="block font-medium text-tdms-ink">{diffForHumans(at)}</span>
                <span className="hidden sm:block">{timeFormat.format(at)}</span>
              </time>
            )}
          </>
        );
        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-tdms-bg ${FOCUS}`}>
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// --- Status breakdown -----------------------------------------------------------------------

/**
 * A segment's colour: its tone, except "Returned", which shares a tone with
 * "Under Review" (both mean the office is waiting) yet must be told apart in the bar.
 */
const fill = (s: WorkSegment) => (s.key === 'returned' && s.tone === 'attention' ? 'bg-accent-violet' : TONE[s.tone].bar);

/** A proportion bar over a legend of every status, each with its count, share and list. */
export function StatusBreakdown({ segments, label }: { segments: WorkSegment[]; label: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span className="text-[28px] font-bold leading-none tracking-[-0.02em] text-tdms-ink tabular-nums">{nf(total)}</span>
        <span className="text-[13px] text-tdms-muted">in total</span>
      </p>
      {total > 0 && (
        <div
          role="img"
          aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}
          className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-tdms-bg"
        >
          {segments.filter((s) => s.value > 0).map((s) => (
            <span key={s.key} className={fill(s)} style={{ width: `${(s.value / total) * 100}%` }} />
          ))}
        </div>
      )}
      <ul className="mt-3">
        {segments.map((s) => {
          const share = total > 0 ? Math.round((s.value / total) * 100) : 0;
          const inner = (
            <>
              <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${fill(s)}`} />
              <span className="min-w-0 flex-1 truncate text-sm text-tdms-ink">{s.label}</span>
              <span className="w-10 text-right text-xs tabular-nums text-tdms-muted">{share}%</span>
              <span className="w-10 text-right text-sm font-semibold tabular-nums text-tdms-ink">{nf(s.value)}</span>
            </>
          );
          return (
            <li key={s.key}>
              {s.href ? (
                <Link href={s.href} className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-tdms-bg ${FOCUS}`}>
                  {inner}
                  <span className="sr-only"> — open {s.label.toLowerCase()} list</span>
                </Link>
              ) : (
                <div className="flex items-center gap-3 py-1.5">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Upcoming events ------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-20" → parts, without a timezone shifting the calendar day. */
function day(key: string) {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return { y, month: MONTHS[m - 1] ?? '', d };
}

function range(e: UpcomingEvent): string {
  const a = day(e.startsOn);
  if (e.endsOn === e.startsOn) return `${a.month} ${a.d}, ${a.y}`;
  const b = day(e.endsOn);
  if (a.y !== b.y) return `${a.month} ${a.d}, ${a.y} – ${b.month} ${b.d}, ${b.y}`;
  return a.month === b.month ? `${a.month} ${a.d}–${b.d}, ${a.y}` : `${a.month} ${a.d} – ${b.month} ${b.d}, ${a.y}`;
}

export function UpcomingEvents({ events }: { events: UpcomingEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon="records"
        title="Nothing scheduled"
        description="No school-calendar entries in the next 60 days."
        action={{ label: 'Open the school calendar', href: '/calendar' }}
      />
    );
  }
  return (
    <ul className="-my-1 divide-y divide-tdms-hairline">
      {events.map((e) => {
        const d = day(e.startsOn);
        return (
          <li key={e.id} className="flex items-center gap-3 py-2.5">
            <span className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-tdms-hairline bg-tdms-bg py-1" aria-hidden="true">
              <span className="text-[10px] font-semibold uppercase leading-tight text-tdms-muted">{d.month}</span>
              <span className="text-lg font-bold leading-tight text-tdms-ink tabular-nums">{d.d}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-tdms-ink" title={e.title}>{e.title}</span>
              <span className="block text-xs text-tdms-muted">
                <time dateTime={e.startsOn}>{range(e)}</time>
              </span>
            </span>
            <span className="hidden shrink-0 rounded-full bg-tdms-wash px-2.5 py-0.5 text-xs font-semibold text-primary-800 min-[420px]:inline">{e.typeLabel}</span>
          </li>
        );
      })}
    </ul>
  );
}

// --- Enrollment by program ------------------------------------------------------------------

export function ProgramTable({ rows }: { rows: EnrollmentByProgramRow[] }) {
  const withStudents = rows.some((r) => r.students !== null);
  const cell = 'px-3 py-3 text-right tabular-nums';
  return (
    // Scrolls inside itself on a narrow screen, never the page.
    <div className="overflow-x-auto rounded-b-xl" role="region" aria-label="Enrollment by program" tabIndex={0}>
      <table className="w-full min-w-[560px] text-sm">
        <caption className="sr-only">Students, applications and enrollment per program</caption>
        <thead>
          <tr className="border-b border-tdms-hairline bg-tdms-bg text-xs font-semibold text-tdms-muted">
            <th scope="col" className="px-5 py-2.5 text-left">Program</th>
            {withStudents && <th scope="col" className="px-3 py-2.5 text-right">Students</th>}
            <th scope="col" className="px-3 py-2.5 text-right">Applications</th>
            <th scope="col" className="px-3 py-2.5 text-right">Approved</th>
            <th scope="col" className="px-3 py-2.5 text-right">Enrolled</th>
            <th scope="col" className="px-5 py-2.5 text-right">Pending enrollment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-tdms-hairline last:border-b-0">
              <th scope="row" className="max-w-[18rem] px-5 py-3 text-left font-normal">
                <span className="block truncate font-semibold text-tdms-ink" title={r.name}>{r.name}</span>
                <span className="block text-xs text-tdms-muted">{r.code}</span>
              </th>
              {withStudents && <td className={`${cell} font-semibold text-tdms-ink`}>{nf(r.students ?? 0)}</td>}
              <td className={cell}>{nf(r.applications)}</td>
              <td className={cell}>{nf(r.approved)}</td>
              <td className={cell}>{nf(r.enrolled)}</td>
              <td className={`px-5 py-3 text-right tabular-nums ${r.pending > 0 ? 'font-semibold text-amber-800' : ''}`}>{nf(r.pending)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
