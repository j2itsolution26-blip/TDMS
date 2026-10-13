import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams as useRouterSearchParams } from 'react-router-dom';

/**
 * Navigation for TDMS screens, on React Router.
 *
 * `refresh()` re-runs the server loaders behind what is on screen — the
 * current page's and the app shell's (sidebar counts, notifications) — so a
 * screen that has just saved something shows the result without a full
 * reload. Loaders subscribe through onRefresh() (see page-data.tsx).
 */

type Listener = () => void;
const listeners = new Set<Listener>();

export function onRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function refreshPageData(): void {
  for (const listener of [...listeners]) listener();
}

export interface AppRouter {
  push(href: string): void;
  replace(href: string): void;
  refresh(): void;
  back(): void;
}

export function useRouter(): AppRouter {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (href: string) => navigate(href),
      replace: (href: string) => navigate(href, { replace: true }),
      refresh: refreshPageData,
      back: () => navigate(-1),
    }),
    [navigate],
  );
}

export function usePathname(): string {
  return useLocation().pathname;
}

/** The current query string, read-only — change it by navigating. */
export function useSearchParams(): URLSearchParams {
  const [params] = useRouterSearchParams();
  return params;
}
