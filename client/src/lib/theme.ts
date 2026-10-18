import { useCallback, useEffect, useState } from 'react';

/**
 * Light and dark themes for the signed-in workspace.
 *
 * Two attributes on <html> decide what is drawn:
 *   data-theme="light|dark"  the person's choice, or their device's setting
 *   data-shell="app|auth"    dark applies only inside the workspace; the
 *                            sign-in, password, setup and print pages keep
 *                            their branded light design whatever the theme
 *
 * public/theme-init.js sets both before the first paint, so a dark page never
 * flashes light; the signed-in layout then sets data-shell for certain, and
 * this module handles changes. The colours themselves are CSS variables
 * (tailwind.config.ts and theme.palette.ts) that the dark theme redefines.
 */

export type Theme = 'light' | 'dark';

/** Remembered per browser. theme-init.js reads the same key. */
export const THEME_KEY = 'tdms.theme';

/** Pages outside the workspace. theme-init.js keeps an identical list (a test checks). */
export const OUTSIDE_APP = ['/login', '/change-password', '/forgot-password', '/reset-password', '/verify-email', '/setup', '/create-super-admin', '/assessment/reports/print'] as const;

export function resolveTheme(stored: string | null, systemDark: boolean): Theme {
  if (stored === 'dark' || stored === 'light') return stored;
  return systemDark ? 'dark' : 'light';
}

export function shellFor(pathname: string): 'app' | 'auth' {
  return OUTSIDE_APP.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ? 'auth' : 'app';
}

function stored(): string | null {
  try {
    return window.localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

const systemQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

const THEME_EVENT = 'tdms:theme';

/** Apply a theme, and tell every useTheme() on the page (the header button, My Profile). */
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * The current theme and a toggle. The first switch is remembered; until then
 * the theme follows the device, live.
 */
export type ThemePreference = Theme | 'system';

export function useTheme(): { theme: Theme; toggle: () => void; preference: ThemePreference; choose: (preference: ThemePreference) => void } {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const s = stored();
    return s === 'dark' || s === 'light' ? s : 'system';
  });

  /** My Profile → Preferences: light, dark, or follow the device (the remembered choice is cleared). */
  const choose = useCallback((next: ThemePreference) => {
    try {
      if (next === 'system') window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode: the choice still applies for this visit.
    }
    const applied = resolveTheme(next === 'system' ? null : next, systemQuery().matches);
    apply(applied);
    setTheme(applied);
    setPreference(next);
  }, []);

  useEffect(() => {
    const query = systemQuery();
    const onChange = () => {
      if (stored() !== null) return;
      const next = resolveTheme(null, query.matches);
      apply(next);
      setTheme(next);
    };
    query.addEventListener('change', onChange);
    // Another useTheme() changed it: follow.
    const onApplied = () => {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
      const s = stored();
      setPreference(s === 'dark' || s === 'light' ? s : 'system');
    };
    window.addEventListener(THEME_EVENT, onApplied);
    return () => {
      query.removeEventListener('change', onChange);
      window.removeEventListener(THEME_EVENT, onApplied);
    };
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      apply(next);
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        // Private mode: the switch still applies for this visit.
      }
      setPreference(next);
      return next;
    });
  }, []);

  return { theme, toggle, preference, choose };
}

/** Marks the document as the workspace while the signed-in layout is mounted. */
export function useWorkspaceShell() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.shell = 'app';
    return () => {
      root.dataset.shell = 'auth';
    };
  }, []);
}
