import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "tdms_session";
const PUBLIC_PATHS = ["/login", "/setup"];

// This is a UX fast-path only (Prisma/the database can't run on the
// Edge runtime middleware uses) — it redirects obviously-unauthenticated
// requests before they render, but it is not the security boundary.
// The real check is requireUser()/requirePermission() in
// src/server/rbac.ts, which every protected Server Component calls
// directly against the database.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)).*)"],
};
