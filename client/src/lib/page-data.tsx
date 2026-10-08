import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { onRefresh } from './navigation';
import NotFound from '@/pages/system/NotFound';
import Forbidden from '@/pages/system/Forbidden';
import LoadError from '@/pages/system/LoadError';

/**
 * Loading a page's data from its server loader (GET /api/v1/pages/...).
 *
 * The server decides everything — who may see the page, where to send them
 * instead, what the screen shows. This only carries out the answer:
 *
 *   data       render the screen
 *   redirect   go there (to /login with ?redirect= when signing in is needed)
 *   401        sign in, then come back
 *   403 / 404  the forbidden / not-found screens
 *   otherwise  an error with a retry
 */

const TAGS = { date: '$date', map: '$map', set: '$set', bigint: '$bigint' } as const;

/** Inverse of server/src/lib/page-encoding.ts. */
export function decodePageData(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decodePageData);

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 1) {
    const [key] = keys;
    if (key === TAGS.date) return new Date(record[key] as string);
    if (key === TAGS.bigint) return BigInt(record[key] as string);
    if (key === TAGS.map) return new Map((record[key] as [unknown, unknown][]).map(([k, v]) => [decodePageData(k), decodePageData(v)]));
    if (key === TAGS.set) return new Set((record[key] as unknown[]).map(decodePageData));
  }
  return Object.fromEntries(keys.map((k) => [k, decodePageData(record[k])]));
}

type State<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'forbidden' }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

function signInPath(pathname: string, search: string): string {
  const back = `${pathname}${search}`;
  return back === '/' || pathname === '/login' ? '/login' : `/login?redirect=${encodeURIComponent(back)}`;
}

export function usePageData<T>(endpoint: string): { state: State<T>; reload: () => void } {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<State<T>>({ status: 'loading' });
  const sequence = useRef(0);
  const loadedKey = useRef<string | null>(null);

  const url = `/api/v1/pages${endpoint}${location.search}`;

  const load = useCallback(async () => {
    const mine = ++sequence.current;
    // A refresh of the same page keeps showing it; a new page shows loading.
    if (loadedKey.current !== url) setState({ status: 'loading' });

    let response: Response;
    let payload: { success?: boolean; data?: unknown; redirect?: string; message?: string; code?: string } | null = null;
    try {
      response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      payload = await response.json().catch(() => null);
    } catch {
      if (mine === sequence.current) setState({ status: 'error', message: 'Could not reach the server. Please try again.' });
      return;
    }
    if (mine !== sequence.current) return;

    if (response.ok && payload?.redirect) {
      const target = payload.redirect === '/login' ? signInPath(location.pathname, location.search) : payload.redirect;
      navigate(target, { replace: true });
      return;
    }
    if (response.ok && payload?.success) {
      loadedKey.current = url;
      setState({ status: 'ready', data: decodePageData(payload.data) as T });
      return;
    }
    if (response.status === 401) {
      navigate(signInPath(location.pathname, location.search), { replace: true });
      return;
    }
    if (response.status === 403 && payload?.code !== 'PASSWORD_CHANGE_REQUIRED') {
      setState({ status: 'forbidden' });
      return;
    }
    if (response.status === 403) {
      navigate('/change-password', { replace: true });
      return;
    }
    if (response.status === 404) {
      setState({ status: 'not-found' });
      return;
    }
    setState({ status: 'error', message: payload?.message ?? 'Something went wrong. Please try again.' });
  }, [url, navigate, location.pathname, location.search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onRefresh(() => void load()), [load]);

  return { state, reload: () => void load() };
}

export interface PageProps<T> {
  /** The loader's path under /api/v1/pages, e.g. `/students` or `/programs/${id}`. */
  endpoint: string;
  render: (data: T) => ReactNode;
  /** Shown while the first load is in flight. */
  loading?: ReactNode;
  /** Replaces the default error panel. */
  error?: (retry: () => void) => ReactNode;
}

export function Page<T>({ endpoint, render, loading = null, error }: PageProps<T>) {
  const { state, reload } = usePageData<T>(endpoint);

  switch (state.status) {
    case 'loading':
      return <>{loading}</>;
    case 'ready':
      return <>{render(state.data)}</>;
    case 'forbidden':
      return <Forbidden onRetry={reload} />;
    case 'not-found':
      return <NotFound />;
    case 'error':
      return <>{error ? error(reload) : <LoadError message={state.message} onRetry={reload} />}</>;
  }
}
