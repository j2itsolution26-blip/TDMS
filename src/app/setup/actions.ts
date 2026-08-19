"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/server/password";
import { createSession } from "@/server/session";
import { recordAudit } from "@/server/audit";
import { isPasswordValid } from "@/lib/password-policy";

const setupSchema = z
  .object({
    name: z.string().min(1, "Full name is required").max(255),
    email: z.string().min(1, "Email is required").email("Enter a valid email address"),
    password: z
      .string()
      .refine(isPasswordValid, "Password does not meet the requirements below."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SetupState = { error?: string };

export async function createInitialSuperAdmin(
  _prev: SetupState,
  formData: FormData
): Promise<SetupState> {
  const parsed = setupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { name, email, password } = parsed.data;
  const h = await headers();
  const meta = {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };

  const passwordHash = await hashPassword(password);

  let userId: number;
  try {
    userId = await prisma.$transaction(async (tx) => {
      // Serializes concurrent setup attempts against the same lock key —
      // without this, two simultaneous requests could both pass the
      // "no super admin yet" check before either commits, creating two.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tdms_super_admin_bootstrap'))`;

      const existing = await tx.userRole.findFirst({
        where: { role: { name: "super_admin" } },
      });
      if (existing) throw new Error("ALREADY_BOOTSTRAPPED");

      const role = await tx.role.upsert({
        where: { name: "super_admin" },
        update: {},
        create: { name: "super_admin" },
      });

      const user = await tx.user.create({
        data: {
          name,
          email,
          password: passwordHash,
          emailVerifiedAt: new Date(),
          isActive: true,
        },
      });

      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });

      return user.id;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_BOOTSTRAPPED") {
      return { error: "A Super Admin account already exists. Please use the login page." };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "That email address is already in use." };
    }
    throw err;
  }

  await recordAudit({
    action: "SUPER_ADMIN_BOOTSTRAPPED",
    actor: { name, email },
    target: `${name} <${email}>`,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  await createSession(userId, meta);
  redirect("/dashboard");
}
