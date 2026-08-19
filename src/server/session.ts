import "server-only";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";

// How stale lastActivity may get before a request bothers refreshing
// it. Touching it on literally every request (the original behavior)
// meant every authenticated page paid for an extra write round trip
// it almost never needed — a session that's active every few seconds
// doesn't need lastActivity accurate to the second, only accurate
// enough that the 120-minute idle timeout is enforced honestly.
const ACTIVITY_TOUCH_THRESHOLD_SECONDS = 60;

const SESSION_COOKIE = "tdms_session";
const SESSION_LIFETIME_SECONDS = 120 * 60; // parity with Laravel's SESSION_LIFETIME=120 (minutes)

function newSessionId(): string {
  // 256 bits of entropy, URL-safe. The session row is the actual source
  // of truth server-side — this token only has to be unguessable, not
  // self-verifying, exactly like Laravel's own session cookie.
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  userId: number,
  meta: { ipAddress?: string | null; userAgent?: string | null }
): Promise<string> {
  const id = newSessionId();

  await prisma.session.create({
    data: {
      id,
      userId,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      payload: "",
      lastActivity: Math.floor(Date.now() / 1000),
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_LIFETIME_SECONDS,
  });

  return id;
}

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  roles: string[];
};

/**
 * Resolves the current request's session against the database and
 * returns the authenticated user, or null. This — not the presence of
 * the cookie, which `middleware.ts` checks only as a fast redirect —
 * is the actual server-side source of truth for "is this user logged
 * in," so every protected Server Component/Server Action must call it
 * (or requireUser/requirePermission below) itself rather than trusting
 * that middleware already handled it.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  // select, not include: this runs on every authenticated request, so
  // it's the hottest query in the app — no reason to pull the user's
  // password hash and other unused columns into memory every time.
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      lastActivity: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      },
    },
  });

  if (!session || !session.user) return null;

  const idleSeconds = Math.floor(Date.now() / 1000) - session.lastActivity;
  if (idleSeconds > SESSION_LIFETIME_SECONDS) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    return null;
  }

  if (!session.user.isActive) {
    // Deactivated mid-session: kill it immediately rather than letting
    // the account keep working until the cookie naturally expires —
    // same rule the Laravel app's EnsureAccountIsActive middleware
    // enforces on every request.
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    return null;
  }

  // Sliding expiration: touch lastActivity so an active user's session
  // doesn't expire mid-use — but only when it's actually gone stale,
  // and after the response has been sent rather than blocking it.
  // getSessionUser() runs on every authenticated request, so this was
  // previously a synchronous write round trip on every single page
  // load; neither the throttle nor the deferral changes when a session
  // is considered expired, since idleSeconds above is still computed
  // from the real lastActivity value each time.
  if (idleSeconds >= ACTIVITY_TOUCH_THRESHOLD_SECONDS) {
    const touchedAt = Math.floor(Date.now() / 1000);
    after(() =>
      prisma.session
        .update({ where: { id: sessionId }, data: { lastActivity: touchedAt } })
        .catch(() => {})
    );
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    isActive: session.user.isActive,
    roles: session.user.roles.map((r) => r.role.name),
  };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  }
  store.delete(SESSION_COOKIE);
}
