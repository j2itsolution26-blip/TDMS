"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/server/password";
import { createSession, getSessionUser } from "@/server/session";
import { recordAudit } from "@/server/audit";

const credentialsSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginState = { error?: string };

async function requestMeta() {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
}

// A single generic message for every failure mode (unknown email, wrong
// password, deactivated account) so the login form never discloses
// which part was wrong — enumeration resistance, enforced server-side
// where a client can't skip it.
const GENERIC_FAILURE = "These credentials do not match our records.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_FAILURE };
  }

  const { email, password } = parsed.data;
  const meta = await requestMeta();

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await verifyPassword(password, user.password))) {
    await recordAudit({
      action: "LOGIN_FAILED",
      actor: "system",
      target: email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { error: GENERIC_FAILURE };
  }

  if (!user.isActive) {
    await recordAudit({
      action: "LOGIN_BLOCKED_INACTIVE",
      actor: "system",
      target: `${user.name} <${user.email}>`,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { error: "This account has been deactivated. Please contact an administrator." };
  }

  // Independent writes — the audit entry doesn't need the session to
  // exist yet or vice versa — so they don't need to be sequential.
  await Promise.all([
    createSession(user.id, meta),
    recordAudit({
      action: "LOGIN_SUCCESS",
      actor: { name: user.name, email: user.email },
      target: `${user.name} <${user.email}>`,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }),
  ]);

  redirect("/dashboard");
}

export async function requireGuest(): Promise<void> {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
}
