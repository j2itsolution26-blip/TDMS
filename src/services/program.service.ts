import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/server/session";
import { userHasPermission } from "@/server/rbac";
import { recordAudit } from "@/server/audit";

export const programInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(50, "Code must be 50 characters or fewer"),
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  isActive: z.boolean(),
});

export type ProgramInput = z.infer<typeof programInputSchema>;

// Every mutation here re-checks the permission itself rather than
// trusting that a caller already did — the same "don't rely on the UI
// having hidden the button" rule the Laravel policies enforce.
function assertCanManagePrograms(actor: SessionUser) {
  if (!userHasPermission(actor, "programs.manage")) {
    throw new Error("You do not have permission to manage programs.");
  }
}

export async function listPrograms() {
  return prisma.program.findMany({ orderBy: { name: "asc" } });
}

export async function createProgram(actor: SessionUser, input: ProgramInput) {
  assertCanManagePrograms(actor);
  const data = programInputSchema.parse(input);

  const existing = await prisma.program.findUnique({ where: { code: data.code } });
  if (existing) {
    throw new Error(`A program with code "${data.code}" already exists.`);
  }

  const program = await prisma.program.create({
    data: {
      code: data.code,
      name: data.name,
      description: data.description || null,
      isActive: data.isActive,
    },
  });

  await recordAudit({
    action: "PROGRAM_CREATED",
    actor: { name: actor.name, email: actor.email },
    target: `${program.name} (${program.code})`,
  });

  return program;
}

export async function updateProgram(actor: SessionUser, id: number, input: ProgramInput) {
  assertCanManagePrograms(actor);
  const data = programInputSchema.parse(input);

  const conflict = await prisma.program.findFirst({
    where: { code: data.code, NOT: { id } },
  });
  if (conflict) {
    throw new Error(`A program with code "${data.code}" already exists.`);
  }

  const program = await prisma.program.update({
    where: { id },
    data: {
      code: data.code,
      name: data.name,
      description: data.description || null,
      isActive: data.isActive,
    },
  });

  await recordAudit({
    action: "PROGRAM_UPDATED",
    actor: { name: actor.name, email: actor.email },
    target: `${program.name} (${program.code})`,
  });

  return program;
}
