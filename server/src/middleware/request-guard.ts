/**
 * The coarse gate in front of the API, run by Fastify on every /api/v1
 * request before the route (see src/app.ts).
 *
 * It is an optimistic check only: it sees whether a session cookie is
 * *present*, not whether it names a live session, who it belongs to, or what
 * they may do. The authoritative checks live in the data layer, where they
 * cannot be skipped: getCurrentUser() resolves and validates the session on
 * every protected page loader and API route, and each policy runs
 * server-side before any action. This exists to refuse cross-site writes and
 * to answer obviously-anonymous API calls without touching the database.
 *
 * Pages are not guarded here. Every page loader (/api/v1/pages/*) resolves
 * the session itself and answers 401 with nowhere to go but /login — the one
 * source of truth that keeps a stale cookie from looping between /login and
 * the dashboard.
 */

export const API_PREFIX = '/api/v1';

/**
 * Reachable without a session. /health and /setup are needed precisely when
 * nobody can sign in; /setup refuses on its own once the system is
 * initialized. Page loaders check the session themselves.
 */
const PUBLIC_API_PREFIXES = [`${API_PREFIX}/auth/`, `${API_PREFIX}/pages/`];
const PUBLIC_API_PATHS = [`${API_PREFIX}/health`, `${API_PREFIX}/setup`, `${API_PREFIX}/setup/status`];

const SESSION_COOKIE = 'tdms_session';

function isPublic(pathname: string): boolean {
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return PUBLIC_API_PATHS.includes(pathname);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for the API: a state-changing request must come from this
 * site. The session cookie is already SameSite=Lax, which stops a cross-site
 * form POST from carrying it in current browsers; this is the server-side
 * check that does not depend on the browser getting that right, and it also
 * covers the pre-auth endpoints (login, setup), which have no cookie to lose.
 *
 * Every legitimate caller is this app's own same-origin fetch(), which always
 * sends Origin on a POST/PUT/PATCH/DELETE. A request with no Origin at all is
 * judged by Sec-Fetch-Site instead, and allowed when neither header is
 * present (curl, server-to-server) — those carry no ambient browser cookies,
 * so there is nothing to forge.
 */
export function isCrossSiteWrite(request: Request): boolean {
  if (SAFE_METHODS.has(request.method)) return false;

  const origin = request.headers.get('origin');
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return true; // "null" or garbage: an opaque origin is never us
    }
    const allowed = [request.headers.get('x-forwarded-host'), request.headers.get('host')]
      .flatMap((h) => (h ? h.split(',').map((v) => v.trim()) : []))
      .filter(Boolean);
    return !allowed.includes(originHost);
  }

  return request.headers.get('sec-fetch-site') === 'cross-site';
}

function hasSessionCookie(request: Request): boolean {
  const header = request.headers.get('cookie') ?? '';
  return header.split(';').some((part) => {
    const [name, ...value] = part.trim().split('=');
    return name === SESSION_COOKIE && value.join('=').length > 0;
  });
}

/**
 * A refusal, or null to let the request through to its route.
 */
export function guardRequest(request: Request): Response | null {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith(`${API_PREFIX}/`)) return null;

  if (isCrossSiteWrite(request)) {
    return Response.json(
      { success: false, message: 'This request was blocked because it came from another site.' },
      { status: 403 },
    );
  }

  if (isPublic(pathname) || hasSessionCookie(request)) return null;

  return Response.json({ success: false, message: 'Unauthenticated.' }, { status: 401 });
}
