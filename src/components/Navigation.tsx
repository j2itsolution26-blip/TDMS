'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar } from './ui';

/**
 * Port of livewire/layout/navigation.blade.php.
 *
 * Alpine's `x-data="{ sidebarOpen: false }"` becomes React state; the
 * escape-to-close handler, the mobile off-canvas panel, the topbar and the
 * user dropdown are all reproduced with the same classes and copy.
 *
 * Which links appear is decided on the SERVER and passed in as `items` —
 * the Blade template used @can directives, and moving that decision into
 * the browser would leak the shape of the permission model to every
 * visitor. Hiding a link is cosmetic anyway: each destination re-checks
 * its own policy.
 */

export interface NavItem {
  label: string;
  href: string;
  /** Route prefixes that should light this item up, as routeIs() did. */
  match: string[];
  icon: 'dashboard' | 'programs' | 'subjects' | 'students' | 'applications' | 'staff';
}

const ICONS: Record<NavItem['icon'], React.ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  ),
  programs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443" />
    </svg>
  ),
  subjects: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  students: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  applications: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  staff: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

function SidebarLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`${
        active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
      } group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition duration-150 ease-in-out`}
    >
      <span className={`w-5 h-5 shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>
        {ICONS[item.icon]}
      </span>
      {item.label}
    </Link>
  );
}

export default function Navigation({
  items,
  user,
}: {
  items: NavItem[];
  user: { name: string; email: string; role: string | null };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Alpine: @keydown.escape.window="sidebarOpen = false"
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        setMenuOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const roleLabel = user.role ? user.role.replace(/_/g, ' ') : 'No role';

  const nav = (onNavigate?: () => void) => (
    <div>
      <div className="space-y-1">
        {items.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(item)} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-64 lg:flex-col bg-navy-900">
        <div className="flex items-center h-16 px-6 border-b border-white/10 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-sm">
              T
            </span>
            <span className="font-bold tracking-tight text-lg text-white">TDMS</span>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">{nav()}</nav>
      </aside>

      {/* Mobile off-canvas sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="fixed inset-0 bg-navy-900/60" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-navy-900 flex flex-col">
            <div className="flex items-center justify-between h-16 px-6 border-b border-white/10 shrink-0">
              <Link href="/dashboard" className="flex items-center gap-2" onClick={() => setSidebarOpen(false)}>
                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-sm">
                  T
                </span>
                <span className="font-bold tracking-tight text-lg text-white">TDMS</span>
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-lg text-slate-300 hover:bg-white/5"
                aria-label="Close sidebar"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
              {nav(() => setSidebarOpen(false))}
            </nav>
          </aside>
        </div>
      )}

      {/* Topbar */}
      <header className="sticky top-0 z-30 lg:pl-64 bg-white border-b border-border">
        <div className="flex items-center h-16 px-4 sm:px-6 gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Open sidebar"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>

          <div className="hidden sm:flex flex-1 max-w-md">
            <div className="relative w-full">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="search"
                placeholder="Search anything…"
                className="w-full rounded-lg border-slate-300 bg-slate-50 pl-9 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex-1 sm:hidden" />

          <div className="flex items-center gap-2 sm:gap-4">
            <button className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Notifications">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </button>

            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Avatar name={user.name} />
                <span className="hidden md:block text-left">
                  <span className="block text-sm font-medium text-navy-900 leading-tight">{user.name}</span>
                  <span className="block text-xs text-slate-500 leading-tight capitalize">{roleLabel}</span>
                </span>
                <svg className="hidden md:block w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-56 rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-sm font-medium text-navy-900 truncate">{user.name}</p>
                      <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    </div>

                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="block w-full px-4 py-2 text-start text-sm leading-5 text-slate-700 hover:bg-slate-50"
                    >
                      My Profile
                    </Link>

                    <button
                      onClick={handleSignOut}
                      disabled={signingOut}
                      className="block w-full px-4 py-2 text-start text-sm leading-5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
