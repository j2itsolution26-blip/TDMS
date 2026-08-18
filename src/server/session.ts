import "server-only";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

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

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        include: { roles: { include: { role: true } } },
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
  // doesn't expire mid-use.
  await prisma.session
    .update({
      where: { id: sessionId },
      data: { lastActivity: Math.floor(Date.now() / 1000) },
    })
    .catch(() => {});

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
