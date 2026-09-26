import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware — the coarse gate in front of the app.
 *
 * IMPORTANT: this is an optimistic check only. Next.js middleware runs on
 * the Edge runtime, where Prisma cannot open a TCP connection to Postgres,
 * so it can see only whether a session cookie is *present* — not whether it
 * names a live session, nor who it belongs to, nor what they may do.
 *
 * The authoritative checks therefore live in the data layer, where they
 * belong and cannot be skipped: getCurrentUser() resolves and validates the
 * session on every protected page and API route, and each policy runs
 * server-side before any action. Middleware exists to save a round trip for
 * obviously-anonymous traffic and to keep signed-in users off /login — it
 * is not, on its own, the security boundary.
 *
 * This is the mistake the previous Laravel bug report was chasing from the
 * other direction: a session that middleware trusts but the app does not
 * (or vice versa) produces an endless redirect between /login and the
 * dashboard. Keeping one source of truth avoids that entirely.
 */

const SESSION_COOKIE = 'tdms_session';

/** Reachable without signing in. */
const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  // Reached from an email, by someone who cannot yet sign in. The token in
  // the URL is the credential; it is single-use and expiring.
  '/reset-password',
  '/verify-email',
  '/create-super-admin',
];

const PUBLIC_API_PREFIXES = ['/api/auth/'];

/**
 * Exact public API paths. /api/health has to be reachable without a session,
 * because it is needed precisely when nobody can sign in.
 */
const PUBLIC_API_PATHS = ['/api/health'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (PUBLIC_API_PATHS.includes(pathname)) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  /*
   * NOTE: middleware deliberately does NOT redirect cookie-holders away
   * from /login.
   *
   * Doing so on cookie *presence* causes an infinite redirect whenever the
   * cookie is stale — expired, revoked, or pointing at a deactivated
   * account. Middleware would send the visitor to /dashboard, the app would
   * resolve the session for real, find it worthless and redirect back to
   * /login, and round it would go. Only the data layer can tell a stale
   * cookie from a live session, so only the data layer gets to make that
   * call: /login itself redirects a genuinely-authenticated visitor to the
   * dashboard.
   *
   * The reverse direction is safe here, because the worst case of being
   * wrong is one extra hop rather than a loop.
   */
  if (isPublic(pathname)) return NextResponse.next();

  if (!hasSessionCookie) {
    // API callers get JSON, not an HTML redirect they cannot parse.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false, message: 'Unauthenticated.' }, { status: 401 });
    }

    const loginUrl = new URL('/login', request.url);
    // Laravel's intended-URL behaviour, preserved.
    if (pathname !== '/') loginUrl.searchParams.set('redirect', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except Next's own assets and the files in /public. Without
     * this the middleware would run for every image and font on the login
     * page, which is pure latency.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|images/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|css|js|map)$).*)',
  ],
};
