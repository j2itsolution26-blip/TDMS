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
  '/reset-password',
  '/create-super-admin',
];

const PUBLIC_API_PREFIXES = ['/api/auth/'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  // Signed-in users have no business on the login screen.
  if (hasSessionCookie && (pathname === '/login' || pathname === '/create-super-admin')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

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
