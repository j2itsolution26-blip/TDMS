import { toPlain } from './serialize';

/**
 * The single JSON envelope every API route answers with, per Phase 6:
 *   { success: true, data }        /  { success: false, message, errors? }
 */
export function ok<T>(data: T, status = 200) {
  return Response.json({ success: true, data: toPlain(data) }, { status });
}

export function fail(
  message: string,
  status = 400,
  errors?: Record<string, string[]>,
  code?: string,
) {
  return Response.json(
    { success: false, ...(code ? { code } : {}), message, ...(errors ? { errors } : {}) },
    { status },
  );
}

/**
 * Domain-level failure that is safe to show a user. Anything thrown that is
 * NOT one of these is treated as unexpected and reported generically, so
 * database messages, stack traces and file paths never reach the browser.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly errors?: Record<string, string[]>,
    /**
     * A stable, machine-readable label for the KIND of failure, e.g.
     * EMAIL_AUTH_FAILED. It exists so a failure can be diagnosed from the
     * response alone — which matters when the only view of a deployment is
     * the browser's Network tab.
     *
     * It names a class of problem, never a cause in detail: no host, no
     * credential, no provider text. Those go to the server log.
     */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Unauthenticated.') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'This action is unauthorized.') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * `ok()` for a response that carries a secret — a temporary password or an
 * access code. `no-store` keeps it out of the browser cache, the back/forward
 * cache and any shared proxy, so the only copy is the one on screen.
 */
export function okSecret<T>(data: T, status = 200) {
  const response = ok(data, status);
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  return response;
}
