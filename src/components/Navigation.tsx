'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar } from './ui';

/**
 * The application shell: sidebar, header, search and the profile menu.
 *
 * Which links appear is decided on the SERVER and passed in as `items` — the
 * browser is never told the shape of the permission model, and hiding a link
 * is cosmetic anyway: each destination re-checks its own policy.
 *
 * TWO THINGS THIS HEADER DELIBERATELY DOES NOT HAVE
 *
 *   * A notification bell. TDMS has no notification system, so a bell could
 *     only ever be decoration or a fabricated count. The previous header had
 *     one that did nothing when pressed.
 *   * A search box that searches records. There is no search backend. The box
 *     here searches what it can honestly search — the pages this user may open
 *     — and jumps straight to one. The previous box accepted text and did
 *     nothing with it.
 */

export interface NavItem {
  label: string;
  href: string;
  /** Route prefixes that should light this item up. */
  match: string[];
  icon: 'dashboard' | 'programs' | 'subjects' | 'students' | 'applications' | 'staff' | 'admins' | 'keys' | 'audit' | 'health';
}

const ICONS: Record<NavItem['icon'] | 'profile', string> = {
  dashboard:
    'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  programs:
    'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443',
  subjects:
    'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  students:
    'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  applications:
    'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  staff:
    'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z',
  audit:
    'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
  health:
    'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z',
  keys:
    'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z',
  admins:
    'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  profile:
    'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
};

function Glyph({ name, className = 'h-5 w-5' }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}

const FOCUS_DARK = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-forest';
const FOCUS_LIGHT = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';

/**
 * The TDMS mark: the Diploma Program Department's own logo, the same file the
 * sign-in screen uses — not a stand-in icon. It is green artwork on a
 * transparent background, so it sits on a white disc to stay legible against
 * the green sidebar.
 */
function Brand() {
  return (
    <span className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white p-1 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/auth/logo.png" alt="" width={32} height={28} className="h-auto w-full" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold leading-tight tracking-tight text-white">TDMS</span>
        <span className="block truncate text-[11px] leading-tight text-primary-100">Diploma Management System</span>
      </span>
    </span>
  );
}

function SidebarLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${FOCUS_DARK} ${
        active ? 'bg-primary-600 text-white shadow-sm' : 'text-[#CFE3DA] hover:bg-white/[0.07] hover:text-white'
      }`}
    >
      <span className={active ? 'text-white' : 'text-primary-200 group-hover:text-white'}>
        <Glyph name={item.icon} />
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Sidebar({
  items,
  isActive,
  roleLabel,
  userName,
  onNavigate,
}: {
  items: NavItem[];
  isActive: (item: NavItem) => boolean;
  roleLabel: string;
  userName: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center border-b border-forest-line px-5">
        <Link href="/dashboard" onClick={onNavigate} className={`rounded-lg ${FOCUS_DARK}`} aria-label="TDMS — go to dashboard">
          <Brand />
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.href}>
              <SidebarLink item={item} active={isActive(item)} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 p-3">
        <div className="flex items-center gap-3 rounded-lg border border-forest-line bg-forest-light px-3 py-2.5">
          <Avatar name={userName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{userName}</p>
            <p className="truncate text-[11px] text-primary-100">{roleLabel}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Jump to a page. Searches the pages this user is allowed to open — the same
 * list the sidebar shows — plus their profile. An ARIA combobox: arrows move,
 * Enter opens, Escape closes.
 */
function PageSearch({ items }: { items: NavItem[] }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const pages = useMemo(
    () => [
      ...items.map((i) => ({ label: i.label, href: i.href, icon: i.icon as keyof typeof ICONS })),
      { label: 'My Profile', href: '/profile', icon: 'profile' as const },
    ],
    [items],
  );

  const q = query.trim().toLowerCase();
  const results = q ? pages.filter((p) => p.label.toLowerCase().includes(q)) : [];

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function go(href: string) {
    setQuery('');
    setOpen(false);
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

  return (
    <div ref={wrapRef} className="relative w-full">
      <label htmlFor="page-search" className="sr-only">
        Go to a page
      </label>
      <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
      <input
        id="page-search"
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Go to a page…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border-border bg-surface py-2 pl-9 text-sm text-ink placeholder:text-slate-500 focus:border-primary-600 focus:bg-white focus:ring-primary-600"
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Pages"
          className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted" role="option" aria-selected="false" aria-disabled="true">
              No page matches “{query.trim()}”
            </li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.href}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(r.href);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm ${
                  i === active ? 'bg-primary-50 text-primary-800' : 'text-ink'
                }`}
              >
                <Glyph name={r.icon} className="h-4 w-4 text-primary-600" />
                {r.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default function Navigation({
  items,
  user,
}: {
  items: NavItem[];
  user: { name: string; email: string; roleLabel: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        if (menuOpen) {
          setMenuOpen(false);
          menuButton.current?.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // Close the drawer when navigation happens by any route, not only a click.
  useEffect(() => {
    setSidebarOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const isActive = (item: NavItem) =>
    item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      // replace(), not push(), so Back does not land on a dead dashboard.
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <div>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-700 focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden bg-forest lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-64" aria-label="Sidebar">
        <Sidebar items={items} isActive={isActive} roleLabel={user.roleLabel} userName={user.name} />
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="fixed inset-0 bg-ink/60" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-forest">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className={`absolute right-3 top-4 rounded-lg p-2 text-primary-100 hover:bg-white/10 ${FOCUS_DARK}`}
              aria-label="Close navigation"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <Sidebar items={items} isActive={isActive} roleLabel={user.roleLabel} userName={user.name} onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-white lg:pl-64">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className={`-ml-2 rounded-lg p-2 text-slate-600 hover:bg-surface lg:hidden ${FOCUS_LIGHT}`}
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>

          <div className="min-w-0 max-w-md flex-1">
            <PageSearch items={items} />
          </div>

          <div className="ml-auto">
            <div className="relative">
              <button
                ref={menuButton}
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className={`flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 hover:bg-surface ${FOCUS_LIGHT}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Account menu for ${user.name}, ${user.roleLabel}`}
              >
                <Avatar name={user.name} />
                <span className="hidden text-left md:block">
                  <span className="block max-w-[12rem] truncate text-sm font-semibold leading-tight text-ink">{user.name}</span>
                  <span className="block text-xs leading-tight text-muted">{user.roleLabel}</span>
                </span>
                <svg className="hidden h-4 w-4 text-slate-500 md:block" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                  <div role="menu" aria-label="Account" className="absolute right-0 z-50 mt-2 w-60 rounded-lg border border-border bg-white py-1 shadow-lg">
                    <div className="border-b border-border px-4 py-2.5">
                      <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                      <p className="truncate text-xs text-muted">{user.email}</p>
                    </div>
                    <Link
                      role="menuitem"
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="block w-full px-4 py-2 text-start text-sm text-ink hover:bg-surface focus:bg-surface focus:outline-none"
                    >
                      My Profile
                    </Link>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={handleSignOut}
                      disabled={signingOut}
                      className="block w-full px-4 py-2 text-start text-sm text-ink hover:bg-surface focus:bg-surface focus:outline-none disabled:opacity-50"
                    >
                      {signingOut ? 'Signing Out…' : 'Sign Out'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}
