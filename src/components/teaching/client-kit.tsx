'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ApiResult } from '@/lib/api-client';
import { INPUT } from './kit';

/**
 * Client helpers for the module's screens.
 *
 * useAction runs one server call at a time and keeps what the screen needs to
 * show: busy, the error message, field errors and a success note. A success
 * refreshes the server components (router.refresh) rather than reloading the
 * page, so the list and the counts update in place.
 */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(call: () => Promise<ApiResult<T>>, options: { success?: string; refresh?: boolean } = {}): Promise<T | null> => {
      setBusy(true);
      setError(null);
      setErrors({});
      setNotice(null);
      const result = await call();
      setBusy(false);
      if (!result.ok) {
        setErrors(result.errors ?? {});
        setError(result.message);
        return null;
      }
      if (options.success) setNotice(options.success);
      if (options.refresh !== false) router.refresh();
      return result.data;
    },
    [router],
  );

  const clear = useCallback(() => {
    setError(null);
    setErrors({});
    setNotice(null);
  }, []);

  return { busy, error, errors, notice, run, clear, setError, setNotice };
}

/** Multipart upload with the same envelope as api-client. */
export async function sendForm<T>(method: 'POST' | 'PUT', url: string, form: FormData): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { method, body: form, credentials: 'same-origin' });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      return { ok: false, message: payload?.message ?? 'Something went wrong. Please try again.', errors: payload?.errors, code: payload?.code, status: response.status };
    }
    return { ok: true, data: payload.data as T };
  } catch {
    return { ok: false, message: 'Could not reach the server. Please try again.', status: 0 };
  }
}

/** Switch the page's school year (?year=) — every list is scoped by it. */
export function YearSwitcher({ years, current }: { years: { id: string; label: string; status: string }[]; current: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (years.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-[13px] font-semibold text-tdms-ink">
      <span>School year</span>
      <select
        className={`${INPUT} w-auto py-2`}
        value={current ?? ''}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set('year', e.target.value);
          next.delete('class');
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {years.map((y) => (
          <option key={y.id} value={y.id}>
            {y.label.replace('-', '–')}
            {y.status === 'ACTIVE' ? ' (current)' : y.status === 'ARCHIVED' ? ' (archived)' : ' (upcoming)'}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Pick one of the Instructor's classes (?class=). */
export function ClassPicker({ classes, current, label = 'Class' }: { classes: { id: string; label: string }[]; current: string | null; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-tdms-ink">
      <span className="shrink-0">{label}</span>
      <select
        className={`${INPUT} min-w-0 py-2`}
        value={current ?? ''}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value) next.set('class', e.target.value);
          else next.delete('class');
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {!current && <option value="">Choose a class…</option>}
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
