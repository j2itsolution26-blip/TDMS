import Link from '@/lib/link';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FolderOpen,
  GraduationCap,
  Info,
  Layers,
  ListChecks,
  ListTodo,
  Presentation,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { diffForHumans } from '@shared/lib/dates';
import type {
  DashboardIcon,
  ListItem,
  QuickLink,
  StatusLabel,
  WorkIcon,
  WorkItem,
  WorkMetric,
  WorkProgress,
  WorkSegment,
  WorkTone,
} from '@shared/types/dashboard';

/**
 * The parts the Director, Coordinator and Secretary dashboards are built
 * from — one design system, so the three look like one application while
 * showing entirely different work.
 *
 * White cards on the light green-grey canvas, a hairline border and a soft
 * shadow. Green is the brand; the KPI accents (ACCENT below) say what a figure
 * counts, and status colours say what state it is in. The welcome banner is
 * the shared WelcomeBanner; motion is a small hover lift, off under reduced motion.
 *
 * Server components throughout. Accessibility, once, here: every card is a
 * <section> named by its heading; statuses are words, never colour alone;
 * icons are decorative; every interactive element has a visible focus ring.
 */

export const FOCUS =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-tdms-text focus-visible:ring-offset-2';

const STROKE = 1.9;

export const WORK_ICONS: Record<WorkIcon, LucideIcon> = {
  programs: GraduationCap,
  students: UsersRound,
  teachers: Presentation,
  applications: FileText,
  enrollment: ClipboardCheck,
  curricula: ClipboardList,
  subjects: BookOpen,
  documents: FolderOpen,
  attention: AlertTriangle,
  graduation: Award,
  registrations: UserPlus,
  tasks: ListTodo,
  records: ListChecks,
};

/** The activity feed's kinds, in the same icon set. */
const ACTIVITY_ICONS: Partial<Record<DashboardIcon, LucideIcon>> = {
  applications: FileText,
  students: UsersRound,
  enrollment: ClipboardCheck,
  documents: FolderOpen,
  curricula: ClipboardList,
  subjects: BookOpen,
  programs: GraduationCap,
};

export function Glyph({ icon, className = 'h-5 w-5' }: { icon: WorkIcon; className?: string }) {
  const Icon = WORK_ICONS[icon];
  return <Icon className={className} strokeWidth={STROKE} aria-hidden="true" />;
}

/** Text and tint per tone. Text colours clear WCAG AA on their tints. */
export const TONE: Record<WorkTone, { text: string; tint: string; dot: string; bar: string }> = {
  success: { text: 'text-emerald-800', tint: 'bg-emerald-50', dot: 'bg-emerald-600', bar: 'bg-emerald-600' },
  attention: { text: 'text-amber-800', tint: 'bg-amber-50', dot: 'bg-amber-500', bar: 'bg-amber-500' },
  failed: { text: 'text-red-700', tint: 'bg-red-50', dot: 'bg-red-600', bar: 'bg-red-600' },
  info: { text: 'text-blue-700', tint: 'bg-blue-50', dot: 'bg-blue-600', bar: 'bg-blue-600' },
  neutral: { text: 'text-slate-700', tint: 'bg-slate-100', dot: 'bg-slate-400', bar: 'bg-slate-400' },
};

// --- Cards ----------------------------------------------------------------------------------

export function SectionCard({
  id,
  title,
  description,
  action,
  children,
  className = '',
}: {
  id: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className={`flex min-w-0 flex-col rounded-2xl border border-tdms-hairline bg-white shadow-card ${className}`}>
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-base font-bold tracking-[-0.01em] text-tdms-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[13px] text-tdms-muted">{description}</p>}
        </div>
        {action && (
          <Link href={action.href} className={`inline-flex shrink-0 items-center gap-1 rounded-md text-[13px] font-semibold text-tdms-text hover:underline ${FOCUS}`}>
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={STROKE} aria-hidden="true" />
            <span className="sr-only"> — {title}</span>
          </Link>
        )}
      </header>
      <div className="flex-1 px-5 pb-5 sm:px-6">{children}</div>
    </section>
  );
}

/** An absence that says what it means and where to go — never a blank card. */
export function EmptyState({ icon, title, description, action }: { icon: WorkIcon; title: string; description: string; action?: { label: string; href: string } }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-tdms-hairline bg-tdms-bg/50 px-4 py-8 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-tdms-wash text-tdms-text">
        <Glyph icon={icon} className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-tdms-ink">{title}</p>
      <p className="mt-1 max-w-xs text-[13px] text-tdms-muted">{description}</p>
      {action && (
        <Link href={action.href} className={`mt-3 rounded-md text-[13px] font-semibold text-tdms-text hover:underline ${FOCUS}`}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

// --- Metrics --------------------------------------------------------------------------------

/**
 * The KPI colours, by what a figure counts — the same everywhere:
 *   emerald  programs and outcomes        blue    students and instructors
 *   violet   curricula and subjects       amber   work waiting (pending)
 *   coral    something needing attention (a failed or overdue figure)
 * Amber only when work is really waiting (an attention tone and a count above
 * zero); otherwise applications, enrollment and documents are student-flow
 * figures (blue) and a clear task list is green.
 */
type Accent = 'emerald' | 'blue' | 'violet' | 'amber' | 'coral';
const ACCENT_BY_ICON: Record<WorkIcon, Accent> = {
  programs: 'emerald', graduation: 'emerald',
  students: 'blue', teachers: 'blue', registrations: 'blue',
  curricula: 'violet', subjects: 'violet',
  applications: 'blue', enrollment: 'blue', documents: 'blue', records: 'blue', tasks: 'emerald',
  attention: 'coral',
};
export const ACCENT: Record<Accent, { tile: string; text: string; bar: string; edge: string }> = {
  emerald: { tile: 'bg-primary-50 text-primary-600 ring-primary-100', text: 'text-primary-700', bar: 'bg-primary-500', edge: 'from-primary-400' },
  blue: { tile: 'bg-accent-blue-50 text-accent-blue ring-blue-100', text: 'text-accent-blue-700', bar: 'bg-accent-blue', edge: 'from-accent-blue' },
  violet: { tile: 'bg-accent-violet-50 text-accent-violet ring-violet-100', text: 'text-accent-violet-700', bar: 'bg-accent-violet', edge: 'from-accent-violet' },
  amber: { tile: 'bg-accent-amber-50 text-accent-amber ring-amber-100', text: 'text-accent-amber-700', bar: 'bg-accent-amber', edge: 'from-accent-amber' },
  coral: { tile: 'bg-accent-coral-50 text-accent-coral ring-rose-100', text: 'text-accent-coral-700', bar: 'bg-accent-coral', edge: 'from-accent-coral' },
};
export function accentOf(metric: Pick<WorkMetric, 'icon' | 'tone' | 'value'>): Accent {
  if (metric.tone === 'failed' || (metric.icon === 'attention' && metric.value > 0)) return 'coral';
  if (metric.tone === 'attention' && metric.value > 0) return 'amber';
  return ACCENT_BY_ICON[metric.icon];
}

function MetricCard({ metric }: { metric: WorkMetric }) {
  const tone = metric.tone && metric.tone !== 'neutral' ? TONE[metric.tone] : null;
  const accent = ACCENT[accentOf(metric)];
  const body = (
    <>
      {/* A thin accent line along the top edge. */}
      <span aria-hidden="true" className={`absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-gradient-to-r ${accent.edge} to-transparent opacity-80`} />
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset sm:h-10 sm:w-10 ${accent.tile}`}>
          <Glyph icon={metric.icon} className="h-5 w-5" />
        </span>
        {metric.href && <ArrowRight className="h-4 w-4 text-tdms-muted opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" strokeWidth={STROKE} aria-hidden="true" />}
      </div>
      <p className="mt-3 text-[12px] font-medium text-tdms-muted sm:text-[13px]">{metric.label}</p>
      <p className="mt-1 text-[24px] font-bold sm:text-[28px] leading-none tracking-[-0.02em] text-tdms-ink tabular-nums">{metric.value.toLocaleString('en-US')}</p>
      <p className={`mt-2 text-xs font-medium ${tone ? tone.text : 'text-tdms-muted'}`}>{metric.hint}</p>
    </>
  );
  const box = 'group relative block h-full overflow-hidden rounded-2xl border border-tdms-hairline bg-white p-3.5 shadow-card sm:p-5';
  return metric.href ? (
    <Link href={metric.href} className={`${box} transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-card-hover motion-reduce:transform-none ${FOCUS}`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

export function MetricGrid({ metrics }: { metrics: WorkMetric[] }) {
  if (metrics.length === 0) return null;
  return (
    <ul aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 2xl:grid-cols-6">
      {metrics.map((m) => (
        <li key={m.key}>
          <MetricCard metric={m} />
        </li>
      ))}
    </ul>
  );
}

// --- Work lists (queue, tasks, actions) -----------------------------------------------------

/**
 * Rows of waiting work, each with its count and the button that opens it. A
 * clear row stays visible but quiet, reading "Clear" rather than a bare 0.
 */
export function WorkList({ items, prominent = false }: { items: WorkItem[]; prominent?: boolean }) {
  return (
    <ul className="divide-y divide-tdms-hairline">
      {items.map((item) => {
        const waiting = item.count > 0;
        return (
          <li key={item.key} className={`flex items-center gap-3 ${prominent ? 'py-3.5' : 'py-3'}`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${waiting ? 'bg-amber-50 text-amber-700' : 'bg-tdms-bg text-tdms-muted'}`}>
              <Glyph icon={item.icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-tdms-ink">{item.label}</span>
              <span className="block truncate text-xs text-tdms-muted">{item.description}</span>
            </span>
            <span className={`shrink-0 text-right tabular-nums ${prominent ? 'min-w-[3rem] text-xl' : 'min-w-[2.5rem] text-lg'} font-bold ${waiting ? 'text-tdms-ink' : 'text-tdms-muted'}`}>
              {waiting ? item.count.toLocaleString('en-US') : <span className="text-xs font-semibold">Clear</span>}
            </span>
            <Link
              href={item.href}
              aria-label={`${item.action}: ${item.label}${waiting ? ` (${item.count})` : ''}`}
              className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${FOCUS} ${
                waiting
                  ? 'border-tdms-text bg-tdms-text text-white hover:bg-primary-700'
                  : 'border-tdms-hairline bg-white text-tdms-ink hover:bg-tdms-bg'
              }`}
            >
              {item.action}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// --- Segments (pipelines, breakdowns) -------------------------------------------------------

/**
 * Stage tiles. `bar` draws a proportion bar above them — only for stages that
 * do not overlap (a pipeline, document states), where the parts make a whole.
 * `wide` is for a card with room for every tile in one row.
 */
export function SegmentGrid({ segments, label, bar = true, wide = false }: { segments: WorkSegment[]; label: string; bar?: boolean; wide?: boolean }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <div>
      {bar && total > 0 && (
        <div role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`} className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-tdms-bg">
          {segments.filter((s) => s.value > 0).map((s) => (
            <span key={s.key} className={TONE[s.tone].bar} style={{ width: `${(s.value / total) * 100}%` }} />
          ))}
        </div>
      )}
      <ul className={`grid grid-cols-2 gap-3 ${wide ? (segments.length >= 5 ? 'sm:grid-cols-3 2xl:grid-cols-5' : 'sm:grid-cols-4') : ''}`}>
        {segments.map((s) => {
          const inner = (
            <>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-tdms-muted">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${TONE[s.tone].dot}`} />
                {s.label}
              </span>
              <span className="mt-1 block text-2xl font-bold tabular-nums text-tdms-ink">{s.value.toLocaleString('en-US')}</span>
            </>
          );
          return (
            <li key={s.key}>
              {s.href ? (
                <Link href={s.href} className={`block h-full rounded-xl border border-tdms-hairline p-3 transition-colors hover:bg-tdms-bg ${FOCUS}`}>
                  {inner}
                </Link>
              ) : (
                <div className="h-full rounded-xl border border-tdms-hairline p-3">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Progress -------------------------------------------------------------------------------

export function ProgressList({ rows }: { rows: WorkProgress[] }) {
  return (
    <ul className="space-y-4">
      {rows.map((r) => {
        const pct = r.max > 0 ? Math.round((r.value / r.max) * 100) : 0;
        return (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-tdms-ink">{r.label}</span>
              <span className="text-sm font-bold tabular-nums text-tdms-ink">{pct}%</span>
            </div>
            <div
              role="progressbar"
              aria-label={r.label}
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={r.detail}
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-tdms-bg"
            >
              <span className={`block h-full rounded-full ${pct === 100 ? 'bg-emerald-600' : 'bg-tdms-green'}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-tdms-muted">{r.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}

// --- Activity -------------------------------------------------------------------------------

export function ActivityList({ items }: { items: ListItem[] }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = (item.icon && ACTIVITY_ICONS[item.icon]) || FileText;
        const body = (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tdms-bg text-tdms-text">
              <Icon className="h-4 w-4" strokeWidth={STROKE} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-tdms-ink">{item.title}</span>
              {item.subtitle && <span className="block truncate text-xs text-tdms-muted">{item.subtitle}</span>}
            </span>
            {item.at && <span className="shrink-0 text-xs text-tdms-muted tabular-nums">{diffForHumans(item.at)}</span>}
          </>
        );
        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-tdms-bg ${FOCUS}`}>
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// --- Quick actions --------------------------------------------------------------------------

export function QuickLinks({ links, compact = false }: { links: QuickLink[]; compact?: boolean }) {
  return (
    <ul className={`grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 ${compact ? '' : 'lg:grid-cols-4'}`}>
      {links.map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            className={`flex h-full items-center gap-3 rounded-xl border border-tdms-hairline bg-white px-3.5 py-3 transition-colors hover:border-primary-200 hover:bg-tdms-bg ${FOCUS}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tdms-wash text-tdms-text">
              <Glyph icon={l.icon} className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-tdms-ink">{l.label}</span>
              <span className="block truncate text-xs text-tdms-muted">{l.description}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// --- Honesty note ---------------------------------------------------------------------------

/** What this role would watch but TDMS does not record yet — said once, plainly. */
export function NotTrackedNote({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  const list = items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-tdms-hairline bg-white px-4 py-3 text-[13px] text-tdms-muted">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" strokeWidth={STROKE} aria-hidden="true" />
      <span>
        <span className="font-semibold text-tdms-ink">Not recorded in TDMS yet: </span>
        {list}. These will appear on this dashboard when those modules are added.
      </span>
    </p>
  );
}

/** The tone of a record status: active/ready read green, needing review amber, the rest grey. */
export function toneOf(status: StatusLabel): WorkTone {
  if (['active', 'ready', 'completed'].includes(status.status)) return 'success';
  if (['needs_review', 'pending'].includes(status.status)) return 'attention';
  return 'neutral';
}

/** A status in a pill — the word first, colour second. */
export function StatusPill({ label, tone }: { label: string; tone: WorkTone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[tone].tint} ${TONE[tone].text}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE[tone].dot}`} />
      {label}
    </span>
  );
}

/** A table wrapper that scrolls inside itself on a narrow screen, never the page. */
export function TableScroll({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
