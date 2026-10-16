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

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/**
 * The current theme and a toggle. The first switch is remembered; until then
 * the theme follows the device, live.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));

  useEffect(() => {
    const query = systemQuery();
    const onChange = () => {
      if (stored() !== null) return;
      const next = resolveTheme(null, query.matches);
      apply(next);
      setTheme(next);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
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
      return next;
    });
  }, []);

  return { theme, toggle };
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
