import Link from '@/lib/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ClipboardCheck,
  FileCheck,
  FileText,
  GraduationCap,
  Inbox,
  Layers,
  Plus,
  Presentation,
  Undo2,
  UserPlus,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { diffForHumans } from '@shared/lib/dates';
import type {
  AdminPanels,
  AdminQuickAction,
  AdminStat,
  ChartPoint,
  DashboardIcon,
  ListItem,
  PendingItem,
  PendingKey,
  SetupProgress,
  SetupStepKey,
} from '@shared/types/dashboard';
import WelcomeBanner, { BANNER_PRIMARY, BANNER_SECONDARY, BannerFact } from './WelcomeBanner';
import { ROLE_LABELS } from '@shared/types/domain';

/**
 * The Admin's workspace.
 *
 * Every figure arrives from the dashboard's server loader, which sends
 * nothing a role may not see. The only browser code is the shared WelcomeBanner, which puts the
 * greeting and date in the viewer's own timezone.
 *
 * ONE SETUP STATE
 *
 * The hero's subtitle and floating cards, the "Get TDMS ready" checklist and
 * the sidebar's setup card all read the same SetupProgress (admin-workspace
 * service), which is decided by the records — a program exists, a subject
 * exists — so they cannot disagree, and each disappears when setup is done.
 *
 * ACCESSIBILITY
 *
 * Every card is a <section> named by its heading; whole-card links carry one
 * accessible name; states are words, never colour alone; icons are
 * decorative; hover lift is dropped under prefers-reduced-motion. Colours were
 * measured for WCAG AA — green TEXT is #0E7A50 (5.4:1), not the brand #16A06A
 * (3.4:1), which is used only for fills and icons.
 */

const ICON = { strokeWidth: 1.9, 'aria-hidden': true } as const;
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-tdms-text focus-visible:ring-offset-2';
const LIFT =
  'transition duration-200 hover:-translate-y-0.5 hover:shadow-soft-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0';
const CARD = 'rounded-[22px] bg-white p-[22px] shadow-soft sm:p-[26px]';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

function CardHeader({ id, title, subtitle, aside }: { id: string; title: string; subtitle?: string; aside?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-[17px] font-bold tracking-[-0.01em] text-tdms-ink">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-[13px] text-tdms-muted">{subtitle}</p>}
      </div>
      {aside}
    </div>
  );
}

// --- Hero -------------------------------------------------------------------------

const NEXT_SENTENCE: Record<SetupStepKey, string> = {
  admin: 'Start by replacing your temporary password.',
  program: 'Start by creating your first diploma program.',
  subjects: 'Next, add the subjects your programs will teach.',
  staff: 'Next, invite your Diploma Instructors.',
  applications: 'Last step: record your first application.',
};

const PRIMARY_ACTION: Record<SetupStepKey, string> = {
  admin: 'Change password',
  program: 'Create program',
  subjects: 'Add subjects',
  staff: 'Invite staff',
  applications: 'Record application',
};

function heroCopy(setup: SetupProgress | null, pending: PendingItem[]) {
  const waiting = pending.filter((p) => p.count > 0);
  const total = waiting.reduce((sum, p) => sum + p.count, 0);

  if (setup && !setup.complete && setup.current) {
    const step = setup.steps.find((s) => s.key === setup.current)!;
    const remaining = setup.total - setup.completed;
    return {
      subtitle: `You're ${plural(remaining, 'step')} away from opening enrollment. ${NEXT_SENTENCE[setup.current]}`,
      primary: { label: PRIMARY_ACTION[setup.current], href: step.href },
    };
  }
  if (total > 0) {
    return {
      subtitle: `${plural(total, 'item')} ${total === 1 ? 'needs' : 'need'} your attention. Start with ${waiting[0].label.toLowerCase()}.`,
      primary: { label: 'Review now', href: waiting[0].href },
    };
  }
  return {
    subtitle: 'Everything is up to date — nothing needs your attention right now.',
    primary: { label: 'View students', href: '/students' },
  };
}

/**
 * The Admin's welcome: the shared banner, with this dashboard's own sentence
 * (the next setup step, or what is waiting) and its two actions.
 */
function Hero({
  firstName,
  greeting,
  date,
  panels,
}: {
  firstName: string;
  greeting: string;
  date: string;
  panels: AdminPanels;
}) {
  const { setup, pending, term } = panels;
  const copy = heroCopy(setup, pending.items);
  const secondary =
    setup?.current === 'staff' ? { label: 'View programs', href: '/programs' } : { label: 'Invite staff', href: '/staff?new=1' };

  return (
    <WelcomeBanner
      firstName={firstName}
      greeting={greeting}
      date={date}
      roleLabel={ROLE_LABELS.admin}
      description={copy.subtitle}
      actions={
        <>
          <Link href={copy.primary.href} className={BANNER_PRIMARY}>
            {/^(Create|Add|Record)/.test(copy.primary.label) && <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />}
            {copy.primary.label}
          </Link>
          <Link href={secondary.href} className={BANNER_SECONDARY}>
            {secondary.label === 'Invite staff' && <UserPlus className="h-4 w-4" {...ICON} />}
            {secondary.label}
          </Link>
        </>
      }
      meta={term ? <BannerFact label="Term" value={term} /> : undefined}
    />
  );
}

// --- Stat cards -------------------------------------------------------------------

const STAT_STYLE: Record<AdminStat['key'], { icon: LucideIcon; tile: string; link: string; spark: string }> = {
  students: { icon: GraduationCap, tile: 'bg-accent-blue-50 text-accent-blue', link: 'text-accent-blue-700', spark: '#2563EB' },
  teachers: { icon: Presentation, tile: 'bg-sky-50 text-sky-700', link: 'text-sky-800', spark: '#0284C7' },
  programs: { icon: Layers, tile: 'bg-primary-50 text-primary-600', link: 'text-primary-700', spark: '#087F5B' },
  applications: { icon: FileText, tile: 'bg-accent-amber-50 text-accent-amber', link: 'text-accent-amber-700', spark: '#D97706' },
  enrollments: { icon: ClipboardCheck, tile: 'bg-accent-violet-50 text-accent-violet', link: 'text-accent-violet-700', spark: '#7C3AED' },
};

/** A faint area chart of a real monthly series. Decorative — the figure says it in words. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 104;
  const h = 40;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 4 - (v / max) * (h - 8)] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute bottom-4 right-4 h-10 w-[104px] opacity-60">
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({ stat }: { stat: AdminStat }) {
  const style = STAT_STYLE[stat.key];
  const Icon = style.icon;
  return (
    <Link
      href={stat.link.href}
      aria-label={`${stat.label}: ${stat.value.toLocaleString('en-US')}, ${stat.tag}. ${stat.link.label}`}
      className={`group relative flex min-h-[184px] flex-col overflow-hidden rounded-[22px] bg-white p-[22px] shadow-soft ${LIFT} ${FOCUS}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-[46px] w-[46px] items-center justify-center rounded-[14px] ${style.tile}`}>
          <Icon className="h-[22px] w-[22px]" {...ICON} />
        </span>
        <span className="rounded-full bg-tdms-bg px-2.5 py-1 text-[11px] font-semibold text-tdms-muted">{stat.tag}</span>
      </div>
      <p className="mt-4 text-[13px] font-medium text-tdms-muted">{stat.label}</p>
      <p className="mt-0.5 text-[34px] font-extrabold leading-none tracking-[-0.03em] text-tdms-ink tabular-nums">
        {stat.value.toLocaleString('en-US')}
      </p>
      <span className={`relative z-10 mt-auto inline-flex items-center gap-1 pt-4 text-[13px] font-semibold ${style.link}`}>
        {stat.link.label}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" {...ICON} />
      </span>
      {stat.trend && <Sparkline values={stat.trend} color={style.spark} />}
    </Link>
  );
}

// --- Get TDMS ready -------------------------------------------------------------------

function SetupChecklist({ setup }: { setup: SetupProgress }) {
  const currentIndex = setup.steps.findIndex((s) => s.key === setup.current);
  return (
    <section aria-labelledby="setup-title" className={CARD}>
      <CardHeader
        id="setup-title"
        title="Get TDMS ready"
        subtitle="This panel disappears once setup is done"
        aside={
          <span className="shrink-0 rounded-full bg-tdms-wash px-3 py-1 text-xs font-bold text-tdms-text">
            <span className="sr-only">Steps complete: </span>
            {setup.completed} / {setup.total}
          </span>
        }
      />

      <ol className="mt-6 space-y-1.5">
        {setup.steps.map((step, i) => {
          const current = i === currentIndex;
          const last = i === setup.steps.length - 1;
          return (
            <li
              key={step.key}
              aria-current={current ? 'step' : undefined}
              className={`relative flex items-center gap-3.5 rounded-2xl px-3 py-3 ${
                current ? 'bg-gradient-to-r from-tdms-wash to-white ring-1 ring-inset ring-primary-100' : ''
              }`}
            >
              {/* The connecting line to the next step: green up to the current step. */}
              {!last && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[27px] top-[44px] h-[calc(100%-20px)] w-[2px] rounded-full ${
                    currentIndex === -1 || i < currentIndex ? 'bg-tdms-green' : 'bg-tdms-hairline'
                  }`}
                />
              )}
              <span
                aria-hidden="true"
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                  step.done
                    ? 'bg-tdms-green text-white'
                    : current
                      ? 'bg-white text-tdms-text ring-2 ring-tdms-green shadow-[0_0_0_5px_rgba(52,195,143,0.25)]'
                      : 'bg-tdms-bg text-tdms-muted ring-1 ring-tdms-hairline'
                }`}
              >
                {step.done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm ${
                    step.done ? 'text-tdms-muted line-through decoration-tdms-muted/60' : current ? 'font-bold text-tdms-ink' : 'font-semibold text-tdms-ink'
                  }`}
                >
                  {step.title}
                  <span className="sr-only">{step.done ? ' — done' : current ? ' — current step' : ' — not started'}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-tdms-muted">{step.detail}</span>
              </span>
              {!step.done && (
                <Link
                  href={step.href}
                  aria-label={`${step.action}: ${step.title}`}
                  className={`shrink-0 rounded-[10px] px-3.5 py-2 text-xs font-bold transition ${FOCUS} ${
                    current
                      ? 'bg-gradient-to-r from-primary-600 to-primary-800 text-white shadow-md shadow-emerald-900/20 hover:brightness-110'
                      : 'bg-[#EEF2F1] text-tdms-ink hover:bg-[#E3E9E7]'
                  }`}
                >
                  {step.action}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// --- Operational tasks and activity ---------------------------------------------------

const TASK_ICON: Record<PendingKey, LucideIcon> = {
  applications: Inbox,
  returned: Undo2,
  documents: FileCheck,
  enrollments: ClipboardCheck,
  staff: UserRound,
};

const TILE_KEYS: PendingKey[] = ['applications', 'returned', 'documents', 'enrollments'];

function OperationalTasks({ items }: { items: PendingItem[] }) {
  const waiting = items.filter((i) => i.count > 0);
  const tiles = TILE_KEYS.map((k) => items.find((i) => i.key === k)).filter((i): i is PendingItem => Boolean(i));

  return (
    <section aria-labelledby="tasks-title" className={CARD}>
      <CardHeader id="tasks-title" title="Operational Tasks" subtitle="What is waiting on the office" />

      {waiting.length === 0 ? (
        <div className="mt-5 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-tdms-wash via-primary-50/60 to-white p-4 ring-1 ring-inset ring-primary-100">
          <span
            aria-hidden="true"
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-tdms-mint to-tdms-green text-white shadow-[0_8px_20px_-6px_rgba(22,160,106,0.6)]"
          >
            <Check className="h-6 w-6" strokeWidth={2.6} />
          </span>
          <span>
            <span className="block text-[15px] font-bold text-tdms-ink">You&apos;re all caught up</span>
            <span className="block text-[13px] text-tdms-muted">Nothing needs your attention right now.</span>
          </span>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {waiting.map((item) => {
            const Icon = TASK_ICON[item.key];
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl bg-amber-50/70 px-3.5 py-3 ring-1 ring-inset ring-amber-200/70 transition hover:bg-amber-50 ${FOCUS}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-600 shadow-sm">
                    <Icon className="h-[18px] w-[18px]" {...ICON} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-tdms-ink">{item.label}</span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 tabular-nums">
                    {item.count.toLocaleString('en-US')}
                    <span className="sr-only"> waiting</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-amber-700" {...ICON} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {tiles.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3">
          {tiles.map((tile) => {
            const Icon = TASK_ICON[tile.key];
            const active = tile.count > 0;
            return (
              <li key={tile.key}>
                <Link
                  href={tile.href}
                  aria-label={`${tile.label}: ${tile.count.toLocaleString('en-US')}`}
                  className={`flex h-full flex-col gap-2 rounded-2xl p-3.5 ${LIFT} ${FOCUS} ${
                    active ? 'bg-amber-50 ring-1 ring-inset ring-amber-200' : 'bg-tdms-bg ring-1 ring-inset ring-tdms-hairline'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <Icon className={`h-[18px] w-[18px] ${active ? 'text-amber-600' : 'text-tdms-muted'}`} {...ICON} />
                    <span className={`text-lg font-extrabold tabular-nums ${active ? 'text-amber-800' : 'text-tdms-ink'}`}>
                      {tile.count.toLocaleString('en-US')}
                    </span>
                  </span>
                  <span className="text-xs font-medium leading-snug text-tdms-muted">{tile.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const ACTIVITY_ICON: Partial<Record<DashboardIcon, LucideIcon>> = {
  applications: FileText,
  students: GraduationCap,
  enrollment: ClipboardCheck,
  documents: FileCheck,
};

function RecentActivity({ items }: { items: ListItem[] }) {
  return (
    <section aria-labelledby="activity-title" className={CARD}>
      <CardHeader
        id="activity-title"
        title="Recent Activity"
        subtitle={items.length ? 'Applications, students, enrollments and documents' : 'New events will appear here'}
      />
      {items.length === 0 ? (
        <>
          <p className="sr-only">No activity yet.</p>
          <ul aria-hidden="true" className="mt-5 space-y-4">
            {[0.55, 0.3].map((opacity) => (
              <li key={opacity} className="flex items-center gap-3" style={{ opacity }}>
                <span className="h-9 w-9 shrink-0 rounded-full bg-[#E4EAE8]" />
                <span className="flex-1 space-y-2">
                  <span className="block h-2.5 w-3/5 rounded-full bg-[#E4EAE8]" />
                  <span className="block h-2 w-2/5 rounded-full bg-[#EDF1F0]" />
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul className="mt-4 space-y-1">
          {items.map((item) => {
            const Icon = (item.icon && ACTIVITY_ICON[item.icon]) || FileText;
            const body = (
              <>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tdms-wash text-tdms-text">
                  <Icon className="h-4 w-4" {...ICON} />
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
                  <Link href={item.href} className={`-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-tdms-bg ${FOCUS}`}>
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// --- Quick actions and New Students ---------------------------------------------------

const QUICK_STYLE: Record<AdminQuickAction['key'], { icon: LucideIcon; tile: string; chip: string }> = {
  program: { icon: Layers, tile: 'bg-[#F1EEFE] ring-[#E4DDFC]', chip: 'text-violet-600' },
  subject: { icon: BookOpen, tile: 'bg-[#EAF4FE] ring-[#D6E8FB]', chip: 'text-sky-600' },
  staff: { icon: UsersRound, tile: 'bg-tdms-wash ring-primary-100', chip: 'text-emerald-600' },
  student: { icon: UserPlus, tile: 'bg-[#FDF1E7] ring-[#F8E0CB]', chip: 'text-orange-600' },
};

function QuickActions({ actions }: { actions: AdminQuickAction[] }) {
  if (actions.length === 0) return null;
  return (
    <section aria-labelledby="quick-title" className={CARD}>
      <CardHeader id="quick-title" title="Quick Actions" />
      <ul className="mt-5 grid grid-cols-2 gap-3">
        {actions.map((a) => {
          const style = QUICK_STYLE[a.key];
          const Icon = style.icon;
          const inner = (
            <>
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ${a.disabled ? 'text-slate-400' : style.chip}`}
              >
                <Icon className="h-5 w-5" {...ICON} />
              </span>
              <span className="mt-3 block text-sm font-bold text-tdms-ink">{a.label}</span>
              <span className="mt-0.5 block text-xs text-tdms-muted">{a.caption}</span>
            </>
          );
          return (
            <li key={a.key}>
              {a.disabled ? (
                <div aria-disabled="true" className="h-full cursor-not-allowed rounded-2xl bg-[#F1F3F3] p-4 ring-1 ring-inset ring-[#E6EAEA]">
                  {inner}
                </div>
              ) : (
                <Link href={a.href} className={`block h-full rounded-2xl p-4 ring-1 ring-inset ${style.tile} ${LIFT} ${FOCUS}`}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const HATCH = 'repeating-linear-gradient(135deg, #E3EAE7 0 6px, #F1F5F3 6px 12px)';
const GHOST_HEIGHTS = [38, 56, 44, 70, 52, 82];

function NewStudents({ points }: { points: ChartPoint[] }) {
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const max = Math.max(...points.map((p) => p.value), 1);
  const summary = points.map((p) => `${p.label} ${p.value}`).join(', ');

  return (
    <section aria-labelledby="students-chart-title" className={CARD}>
      <CardHeader
        id="students-chart-title"
        title="New Students"
        subtitle="Added per month, last 6 months"
        aside={
          <Link href="/students" className={`shrink-0 rounded-md text-xs font-semibold text-tdms-text hover:underline ${FOCUS}`}>
            View all
          </Link>
        }
      />
      <div className="relative mt-5">
        {total === 0 ? (
          <>
            <div aria-hidden="true" className="flex h-[132px] items-end gap-3">
              {GHOST_HEIGHTS.map((h, i) => (
                <span key={i} className="flex-1 rounded-t-lg" style={{ height: `${h}%`, backgroundImage: HATCH }} />
              ))}
            </div>
            <div className="absolute inset-x-0 top-6 flex justify-center">
              <p className="rounded-xl bg-white px-4 py-2.5 text-center shadow-soft">
                <span className="block text-[13px] font-bold text-tdms-ink">No student records yet</span>
                <span className="block text-xs text-tdms-muted">Your growth chart appears here</span>
              </p>
            </div>
          </>
        ) : (
          <div role="img" aria-label={`New students per month: ${summary}.`} className="flex h-[132px] items-end gap-3">
            {points.map((p, i) => (
              <span key={i} className="flex h-full flex-1 flex-col justify-end">
                <span className="mb-1 text-center text-[11px] font-bold text-tdms-ink tabular-nums">{p.value > 0 ? p.value : ''}</span>
                <span
                  className="rounded-t-lg bg-gradient-to-t from-tdms-green to-tdms-mint"
                  style={{ height: `${Math.max((p.value / max) * 82, p.value > 0 ? 6 : 2)}%`, opacity: p.value > 0 ? 1 : 0.25 }}
                />
              </span>
            ))}
          </div>
        )}
        <div aria-hidden="true" className="mt-2 flex gap-3">
          {points.map((p, i) => (
            <span key={i} className="flex-1 text-center text-[11px] font-medium text-tdms-muted">
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// --- The page ------------------------------------------------------------------------

export default function AdminDashboard({
  panels,
  firstName,
  greeting,
  date,
}: {
  panels: AdminPanels;
  firstName: string;
  greeting: string;
  date: string;
}) {
  const showSetup = Boolean(panels.setup && !panels.setup.complete);

  return (
    <div className="space-y-6 font-jakarta">
      <Hero firstName={firstName} greeting={greeting} date={date} panels={panels} />

      {panels.stats.length > 0 && (
        <ul aria-label="Key figures" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 min-[1500px]:grid-cols-5">
          {panels.stats.map((stat) => (
            <li key={stat.key}>
              <StatCard stat={stat} />
            </li>
          ))}
        </ul>
      )}

      <div
        className={`grid grid-cols-1 gap-6 ${
          showSetup ? 'min-[1200px]:grid-cols-2 min-[1500px]:grid-cols-[1.2fr_1fr_1fr]' : 'min-[1200px]:grid-cols-2'
        }`}
      >
        {showSetup && panels.setup && <SetupChecklist setup={panels.setup} />}

        <div className="space-y-6">
          <OperationalTasks items={panels.pending.items} />
          <RecentActivity items={panels.activity} />
        </div>

        <div
          className={`grid grid-cols-1 content-start gap-6 ${
            showSetup ? 'min-[1200px]:col-span-2 min-[1200px]:grid-cols-2 min-[1500px]:col-span-1 min-[1500px]:grid-cols-1' : ''
          }`}
        >
          <QuickActions actions={panels.quickActions} />
          {panels.newStudents && <NewStudents points={panels.newStudents} />}
        </div>
      </div>
    </div>
  );
}
