'use client';

/**
 * Thin client for the JSON envelope every route handler returns.
 *
 * Callers get either the data or a typed failure; they never have to think
 * about status codes or about the { success } wrapper. Validation errors
 * come back keyed by field so a form can render them inline, which is what
 * Livewire's error bag did.
 */

export interface ApiFailure {
  ok: false;
  message: string;
  errors?: Record<string, string[]>;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success) {
      return {
        ok: false,
        message: payload?.message ?? 'Something went wrong. Please try again.',
        errors: payload?.errors,
      };
    }

    return { ok: true, data: payload.data as T };
  } catch {
    return { ok: false, message: 'Could not reach the server. Please try again.' };
  }
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string) => request<T>('PATCH', url),
  del: <T>(url: string) => request<T>('DELETE', url),
};
