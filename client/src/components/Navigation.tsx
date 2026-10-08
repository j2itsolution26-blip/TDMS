import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from '@/lib/link';
import { usePathname, useRouter } from '@/lib/navigation';
import {
  Activity,
  Award,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ClipboardList,
  CircleQuestionMark,
  ClipboardCheck,
  FileCheck,
  FileQuestionMark,
  FileText,
  GraduationCap,
  Hammer,
  HeartHandshake,
  IdCard,
  Laptop,
  LayoutGrid,
  ListChecks,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Presentation,
  QrCode,
  ScanLine,
  ScrollText,
  Search,
  Sheet,
  ShieldCheck,
  Table2,
  TrendingUp,
  UserCog,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { PendingItem } from '@shared/types/dashboard';

/**
 * The application shell: the floating sidebar, the top bar, and the content
 * well they frame.
 *
 * Which links appear is decided on the SERVER and passed in as `items` — the
 * browser is never told the shape of the permission model, and hiding a link
 * is cosmetic anyway: each destination re-checks its own policy.
 *
 * HONEST BY DESIGN
 *
 *   * The bell shows the work waiting on the office (applications to review,
 *     documents to verify…), counted from the records by the same service the
 *     dashboard's Operational Tasks read, and the user's own notifications
 *     (attendance, released scores, reviews, requests). Its badge counts
 *     unread notifications; a plain dot means only that work is waiting.
 *   * Search jumps to what it can honestly find: the pages this user may
 *     open, programs by name or code, and — for those who may see students —
 *     the Students list filtered by the query. Ctrl/⌘ K focuses it.
 *   * The setup card appears only for an Admin whose setup is unfinished,
 *     from the same progress the dashboard checklist shows.
 *
 * RESPONSIVE
 *
 *   ≥ 1024px  a 292px floating sidebar, inset 16px from the window edges
 *   768–1023  an icon rail; every icon keeps its name as its accessible label
 *   < 768px   a drawer behind the menu button
 */

export type { NavItem, NavIcon, NavGroup } from '@shared/types/navigation';
import type { NavItem, NavIcon, NavGroup } from '@shared/types/navigation';

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  programs: Layers,
  subjects: BookOpen,
  students: GraduationCap,
  applications: FileText,
  enrollments: ClipboardCheck,
  staff: UsersRound,
  admins: ShieldCheck,
  keys: KeyRound,
  audit: ScrollText,
  health: Activity,
  profile: UserRound,
  classes: Presentation,
  records: ListChecks,
  gradebook: Sheet,
  qr: QrCode,
  attendance: CalendarCheck,
  quiz: FileQuestionMark,
  exam: ClipboardList,
  checking: ScanLine,
  activity: Laptop,
  task: Hammer,
  progress: TrendingUp,
  support: HeartHandshake,
  document: FileText,
  tos: Table2,
  badge: Award,
  calendar: CalendarDays,
  pds: IdCard,
  schoolYears: CalendarRange,
  setup: LayoutGrid,
  reviews: FileCheck,
  statusRequests: UserCog,
  instructors: Presentation,
  notifications: Bell,
};

const GROUP_LABELS: Record<NavGroup, string> = {
  main: 'Main',
  academic: 'Academic',
  people: 'People & Records',
  records: 'Records',
  admissions: 'Admissions',
  programs: 'Programs',
  system: 'System',
  account: 'Account',
  teaching: 'Teaching',
  attendance: 'Attendance',
  assessments: 'Assessments',
  activities: 'Activities',
  documents: 'Documents',
  engagement: 'Engagement',
  calendar: 'Calendar',
  profile: 'Profile',
  oversight: 'Academic Oversight',
  learning: 'My Learning',
};

const STROKE = 1.9;
const FOCUS_DARK = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3DDC97] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E4D37]';
const FOCUS_LIGHT = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-tdms-text focus-visible:ring-offset-2 focus-visible:ring-offset-tdms-bg';

export interface SetupSummary {
  completed: number;
  total: number;
  /** The current step's page. */
  href: string;
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

// --- Sidebar ------------------------------------------------------------------------

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#3DDC97] to-[#16A06A] text-white shadow-[0_8px_24px_-6px_rgba(61,220,151,0.65)]">
        <GraduationCap className="h-6 w-6" strokeWidth={STROKE} aria-hidden="true" />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block text-lg font-extrabold leading-tight tracking-[-0.02em] text-white">TDMS</span>
          <span className="block truncate text-xs leading-tight text-[#BFE6D4]">Diploma Management</span>
        </span>
      )}
    </span>
  );
}

/** A conic-gradient progress ring. Decorative: the text beside it says the same. */
function ProgressRing({ percent, size = 48 }: { percent: number; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(#3DDC97 ${percent * 3.6}deg, rgba(255,255,255,0.14) 0deg)` }}
    >
      <span className="absolute inset-[5px] rounded-full bg-[#0B4430]" />
      <span className="relative text-[11px] font-bold text-white">{percent}%</span>
    </span>
  );
}

function SetupCard({ setup, onNavigate }: { setup: SetupSummary; onNavigate?: () => void }) {
  const percent = Math.round((setup.completed / setup.total) * 100);
  return (
    <div className="rounded-[18px] bg-white/[0.08] p-4 ring-1 ring-inset ring-white/10 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <ProgressRing percent={percent} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">Setup in progress</p>
          <p className="text-xs text-[#BFE6D4]">
            {setup.completed} of {setup.total} steps complete
          </p>
        </div>
      </div>
      <Link
        href={setup.href}
        onClick={onNavigate}
        className={`mt-3.5 block w-full rounded-xl bg-[#3DDC97] py-2.5 text-center text-sm font-bold text-[#0E4D37] transition hover:bg-[#5BE5A9] ${FOCUS_DARK}`}
      >
        Continue setup
      </Link>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  compact,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={compact ? item.label : undefined}
      title={compact ? item.label : undefined}
      className={`group flex items-center gap-3 rounded-[14px] text-sm font-semibold transition ${FOCUS_DARK} ${
        compact ? 'h-12 w-12 justify-center' : 'px-3.5 py-2.5'
      } ${
        active
          ? 'bg-white text-[#0E4D37] shadow-[0_8px_20px_-8px_rgba(0,0,0,0.45)]'
          : 'text-[#BFE6D4] hover:bg-white/[0.08] hover:text-white'
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-[#16A06A]' : ''}`} strokeWidth={STROKE} aria-hidden="true" />
      {!compact && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function Sidebar({
  items,
  isActive,
  setup,
  compact = false,
  onNavigate,
}: {
  items: NavItem[];
  isActive: (item: NavItem) => boolean;
  setup: SetupSummary | null;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const groups = [...new Set(items.map((i) => i.group))].map((g) => ({ key: g, items: items.filter((i) => i.group === g) }));

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* A faint mint glow in the bottom-left corner. */}
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#3DDC97]/20 blur-3xl" />

      <div className={`relative flex shrink-0 items-center ${compact ? 'justify-center px-2 pb-4 pt-6' : 'px-6 pb-5 pt-7'}`}>
        <Link href="/dashboard" onClick={onNavigate} className={`rounded-[14px] ${FOCUS_DARK}`} aria-label="TDMS — go to dashboard">
          <Brand compact={compact} />
        </Link>
      </div>

      <nav aria-label="Main" className={`relative flex-1 overflow-y-auto ${compact ? 'px-2' : 'px-4'} pb-4`}>
        {groups.map((group, gi) => (
          <div key={group.key} className={gi > 0 ? (compact ? 'mt-3 border-t border-white/10 pt-3' : 'mt-6') : 'mt-2'}>
            {compact ? (
              <h2 className="sr-only">{GROUP_LABELS[group.key]}</h2>
            ) : (
              <h2 className="mb-2 px-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#8FC7AE]">{GROUP_LABELS[group.key]}</h2>
            )}
            <ul className={`space-y-1 ${compact ? 'flex flex-col items-center' : ''}`}>
              {group.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink item={item} active={isActive(item)} compact={compact} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {setup && (
        <div className={`relative shrink-0 ${compact ? 'flex justify-center p-3 pb-6' : 'p-4 pb-5'}`}>
          {compact ? (
            <Link
              href={setup.href}
              onClick={onNavigate}
              aria-label={`Continue setup — ${setup.completed} of ${setup.total} steps complete`}
              title="Continue setup"
              className={`rounded-full ${FOCUS_DARK}`}
            >
              <ProgressRing percent={Math.round((setup.completed / setup.total) * 100)} size={44} />
            </Link>
          ) : (
            <SetupCard setup={setup} onNavigate={onNavigate} />
          )}
        </div>
      )}
    </div>
  );
}

// --- Top bar: search ------------------------------------------------------------------

interface SearchResult {
  key: string;
  label: string;
  kind: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Search: pages this user may open, programs by name or code, and — for
 * those who may see students — the Students list filtered by the query. An
 * ARIA combobox: arrows move, Enter opens, Escape closes. Ctrl/⌘ K focuses it.
 */
function GlobalSearch({
  items,
  programs,
  canSearchStudents,
}: {
  items: NavItem[];
  programs: { id: string; code: string; name: string }[];
  canSearchStudents: boolean;
}) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [shortcut, setShortcut] = useState('Ctrl K');

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut('⌘ K');
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, []);

  const pages = useMemo(
    () => [
      ...items.map((i) => ({ label: i.label, href: i.href, icon: ICONS[i.icon] })),
      { label: 'My Profile', href: '/profile', icon: ICONS.profile },
    ],
    [items],
  );

  const q = query.trim().toLowerCase();
  const results: SearchResult[] = q
    ? [
        ...pages
          .filter((p) => p.label.toLowerCase().includes(q))
          .map((p) => ({ key: `page-${p.href}`, label: p.label, kind: 'Page', href: p.href, icon: p.icon })),
        ...programs
          .filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
          .slice(0, 5)
          .map((p) => ({ key: `program-${p.id}`, label: `${p.code} — ${p.name}`, kind: 'Program', href: `/programs/${p.id}`, icon: Layers })),
        ...(canSearchStudents && q.length >= 2
          ? [{
              key: 'students',
              label: `Search students for “${query.trim()}”`,
              kind: 'Students',
              href: `/students?search=${encodeURIComponent(query.trim())}`,
              icon: GraduationCap,
            }]
          : []),
      ]
    : [];

  function go(href: string) {
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      const target = results[active];
      if (target) {
        e.preventDefault();
        go(target.href);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showList = open && q.length > 0;
  const placeholder = canSearchStudents ? 'Search pages, students, programs…' : 'Search pages and programs…';

  return (
    <div ref={wrapRef} className="relative w-full">
      <label htmlFor="global-search" className="sr-only">
        Search
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-tdms-muted" strokeWidth={STROKE} aria-hidden="true" />
      <input
        ref={inputRef}
        id="global-search"
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-keyshortcuts="Control+K Meta+K"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-12 w-full rounded-[14px] border-0 bg-white pl-11 pr-20 text-sm text-tdms-ink shadow-soft placeholder:text-tdms-muted focus:ring-2 focus:ring-tdms-text [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md bg-tdms-bg px-2 py-1 font-jakarta text-[11px] font-semibold text-tdms-muted ring-1 ring-inset ring-tdms-hairline sm:block"
      >
        {shortcut}
      </kbd>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-soft-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-tdms-muted" role="option" aria-selected="false" aria-disabled="true">
              Nothing matches “{query.trim()}”
            </li>
          ) : (
            results.map((r, i) => {
              const Icon = r.icon;
              return (
                <li
                  key={r.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(r.href);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                    i === active ? 'bg-tdms-wash text-tdms-deep' : 'text-tdms-ink'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-tdms-text" strokeWidth={STROKE} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
                  <span className="shrink-0 text-xs text-tdms-muted">{r.kind}</span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

// --- Top bar: popovers ----------------------------------------------------------------

/** Open state for a small popover: closes on an outside click, and on Escape back to its button. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, wrap, trigger };
}

const ICON_BUTTON = `relative flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-tdms-ink shadow-soft transition hover:text-tdms-text ${FOCUS_LIGHT}`;
const POPOVER = 'absolute right-0 z-50 mt-2 w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-2 shadow-soft-lg';

function HelpButton({ setup }: { setup: SetupSummary | null }) {
  const { open, setOpen, wrap, trigger } = usePopover();
  const id = useId();
  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label="Help"
        className={ICON_BUTTON}
      >
        <CircleQuestionMark className="h-5 w-5" strokeWidth={STROKE} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} role="region" aria-label="Help" className={POPOVER}>
          <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-[0.1em] text-tdms-muted">Keyboard shortcuts</p>
          <dl className="px-3 pb-2 text-sm">
            <div className="flex items-center justify-between py-1.5">
              <dt className="text-tdms-ink">Search</dt>
              <dd><kbd className="rounded-md bg-tdms-bg px-2 py-0.5 text-xs font-semibold text-tdms-muted ring-1 ring-inset ring-tdms-hairline">Ctrl / ⌘ K</kbd></dd>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <dt className="text-tdms-ink">Close a menu or dialog</dt>
              <dd><kbd className="rounded-md bg-tdms-bg px-2 py-0.5 text-xs font-semibold text-tdms-muted ring-1 ring-inset ring-tdms-hairline">Esc</kbd></dd>
            </div>
          </dl>
          <div className="border-t border-tdms-hairline pt-1">
            {setup && (
              <Link href={setup.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-sm font-medium text-tdms-ink hover:bg-tdms-bg focus:bg-tdms-bg focus:outline-none">
                Continue setup ({setup.completed} of {setup.total} done)
              </Link>
            )}
            <Link href="/profile" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-sm font-medium text-tdms-ink hover:bg-tdms-bg focus:bg-tdms-bg focus:outline-none">
              Your profile and password
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export interface NotificationSummary {
  unread: number;
  latest: { id: string; title: string; body: string | null; href: string | null; read: boolean; createdAt: string }[];
}

/**
 * The bell: the work waiting on this user's office (counted from the records)
 * and their own notifications (attendance, scores, reviews, requests…). The
 * badge counts unread notifications; reading one marks it read on the server,
 * so the count is the same on every device.
 */
function PendingBell({ pending, notifications }: { pending: PendingItem[]; notifications: NotificationSummary }) {
  const router = useRouter();
  const { open, setOpen, wrap, trigger } = usePopover();
  const id = useId();
  const waiting = pending.filter((p) => p.count > 0);
  const total = waiting.reduce((sum, p) => sum + p.count, 0);
  const [unread, setUnread] = useState(notifications.unread);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  useEffect(() => setUnread(notifications.unread), [notifications.unread]);

  async function markRead(body: { ids?: string[]; all?: boolean }) {
    await fetch('/api/v1/notifications', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
  }

  function openNotification(n: NotificationSummary['latest'][number]) {
    setOpen(false);
    if (!n.read && !readIds.has(n.id)) {
      setReadIds((prev) => new Set(prev).add(n.id));
      setUnread((u) => Math.max(0, u - 1));
      void markRead({ ids: [n.id] });
    }
    router.push(n.href ?? '/notifications');
  }

  const label = [
    unread > 0 ? `${unread} unread ${unread === 1 ? 'notification' : 'notifications'}` : null,
    total > 0 ? `${total} ${total === 1 ? 'item needs' : 'items need'} attention` : null,
  ].filter(Boolean).join(', ') || 'Notifications: nothing new';

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        className={ICON_BUTTON}
      >
        <Bell className="h-5 w-5" strokeWidth={STROKE} aria-hidden="true" />
        {unread > 0 ? (
          <span aria-hidden="true" className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : total > 0 ? (
          <span aria-hidden="true" className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
        ) : null}
      </button>
      {open && (
        <div id={id} role="region" aria-label="Notifications" className={`${POPOVER} w-[340px]`}>
          {waiting.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-[0.1em] text-tdms-muted">Needs attention</p>
              <ul className="mb-1 border-b border-tdms-hairline pb-1">
                {waiting.map((p) => (
                  <li key={p.key}>
                    <Link
                      href={p.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-tdms-bg focus:bg-tdms-bg focus:outline-none"
                    >
                      <span className="font-medium text-tdms-ink">{p.label}</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 tabular-nums">{p.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex items-center justify-between px-3 pb-1 pt-2">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-tdms-muted">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => {
                  setUnread(0);
                  setReadIds(new Set(notifications.latest.map((n) => n.id)));
                  void markRead({ all: true }).then(() => router.refresh());
                }}
                className="rounded-md text-xs font-semibold text-tdms-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-tdms-text"
              >
                Mark all read
              </button>
            )}
          </div>
          {notifications.latest.length === 0 ? (
            <div className="px-3 pb-3 pt-1">
              <p className="text-sm font-semibold text-tdms-ink">You&apos;re all caught up</p>
              <p className="text-xs text-tdms-muted">New notifications will appear here.</p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notifications.latest.map((n) => {
                const isRead = n.read || readIds.has(n.id);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-tdms-bg focus:bg-tdms-bg focus:outline-none"
                    >
                      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isRead ? 'bg-transparent' : 'bg-tdms-green'}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${isRead ? 'font-medium text-tdms-muted' : 'font-semibold text-tdms-ink'}`}>
                          {n.title}
                          {!isRead && <span className="sr-only"> (unread)</span>}
                        </span>
                        {n.body && <span className="line-clamp-2 block text-xs text-tdms-muted">{n.body}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-xl border-t border-tdms-hairline px-3 py-2.5 text-center text-sm font-semibold text-tdms-text hover:bg-tdms-bg focus:bg-tdms-bg focus:outline-none"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu({ user }: { user: { name: string; email: string; roleLabel: string } }) {
  const router = useRouter();
  const { open, setOpen, wrap, trigger } = usePopover();
  const id = useId();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      // replace(), not push(), so Back does not land on a dead dashboard.
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Account menu for ${user.name}, ${user.roleLabel}`}
        className={`flex h-12 items-center gap-3 rounded-[14px] bg-white pl-1.5 pr-3 shadow-soft transition hover:shadow-soft-lg ${FOCUS_LIGHT}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#16A06A] to-[#0E4D37] text-[13px] font-bold text-white">
          {initialsOf(user.name)}
        </span>
        <span className="hidden text-left md:block">
          <span className="block max-w-[11rem] truncate text-sm font-bold leading-tight text-tdms-ink">{user.name}</span>
          <span className="block text-xs leading-tight text-tdms-muted">{user.roleLabel === 'Admin' ? 'Administrator' : user.roleLabel}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-tdms-muted md:block" strokeWidth={STROKE} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} role="region" aria-label="Account" className={`${POPOVER} w-64`}>
          <div className="border-b border-tdms-hairline px-3 pb-2.5 pt-2">
            <p className="truncate text-sm font-bold text-tdms-ink">{user.name}</p>
            <p className="truncate text-xs text-tdms-muted">{user.email}</p>
          </div>
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-tdms-ink hover:bg-tdms-bg focus:bg-tdms-bg focus:outline-none"
          >
            <UserRound className="h-4 w-4 text-tdms-muted" strokeWidth={STROKE} aria-hidden="true" />
            My Profile
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-tdms-ink hover:bg-tdms-bg focus:bg-tdms-bg focus:outline-none disabled:opacity-50"
          >
            <LogOut className="h-4 w-4 text-tdms-muted" strokeWidth={STROKE} aria-hidden="true" />
            {signingOut ? 'Signing Out…' : 'Sign Out'}
          </button>
        </div>
      )}
    </div>
  );
}

// --- The shell -------------------------------------------------------------------------

export default function Navigation({
  items,
  user,
  setup,
  pending,
  notifications,
  programs,
  canSearchStudents,
  children,
}: {
  items: NavItem[];
  user: { name: string; email: string; roleLabel: string };
  setup: SetupSummary | null;
  pending: PendingItem[];
  notifications: NotificationSummary;
  programs: { id: string; code: string; name: string }[];
  canSearchStudents: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    closeButton.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        menuButton.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // Close the drawer when navigation happens by any route, not only a click.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const isActive = (item: NavItem) => item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-tdms-deep focus:shadow-soft-lg"
      >
        Skip to content
      </a>

      {/* Desktop: the floating sidebar. Tablet: the icon rail. */}
      <aside
        aria-label="Sidebar"
        className="fixed bottom-4 left-4 top-4 z-40 hidden w-[88px] rounded-[24px] bg-gradient-to-b from-[#0E4D37] to-[#093626] shadow-[0_24px_48px_-24px_rgba(9,54,38,0.7)] md:block lg:hidden"
      >
        <Sidebar items={items} isActive={isActive} setup={setup} compact />
      </aside>
      <aside
        aria-label="Sidebar"
        className="fixed bottom-4 left-4 top-4 z-40 hidden w-[292px] rounded-[24px] bg-gradient-to-b from-[#0E4D37] to-[#093626] shadow-[0_24px_48px_-24px_rgba(9,54,38,0.7)] lg:block"
      >
        <Sidebar items={items} isActive={isActive} setup={setup} />
      </aside>

      {/* Mobile: the drawer. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="fixed inset-0 bg-[#062a1d]/60 backdrop-blur-[2px]" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className="fixed bottom-3 left-3 top-3 z-50 w-[292px] max-w-[calc(100vw-1.5rem)] rounded-[24px] bg-gradient-to-b from-[#0E4D37] to-[#093626] shadow-2xl">
            <button
              ref={closeButton}
              type="button"
              onClick={() => setDrawerOpen(false)}
              className={`absolute right-3 top-6 z-10 rounded-xl p-2 text-[#BFE6D4] hover:bg-white/10 hover:text-white ${FOCUS_DARK}`}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" strokeWidth={STROKE} aria-hidden="true" />
            </button>
            <Sidebar items={items} isActive={isActive} setup={setup} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="relative md:pl-[120px] lg:pl-[324px]">
        <header className="mx-auto flex h-[88px] max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button
            ref={menuButton}
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={`${ICON_BUTTON} shrink-0 md:hidden`}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
          >
            <Menu className="h-5 w-5" strokeWidth={STROKE} aria-hidden="true" />
          </button>

          <div className="min-w-0 max-w-[520px] flex-1">
            <GlobalSearch items={items} programs={programs} canSearchStudents={canSearchStudents} />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <HelpButton setup={setup} />
            </div>
            <PendingBell pending={pending} notifications={notifications} />
            <UserMenu user={user} />
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="focus:outline-none">
          <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-2 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </>
  );
}
