"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/rbac";
import { createProgram, updateProgram, programInputSchema } from "@/services/program.service";

export type ProgramFormState = { error?: string; success?: boolean };

function readFormInput(formData: FormData) {
  return {
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    isActive: formData.get("isActive") === "on",
  };
}

export async function createProgramAction(
  _prev: ProgramFormState,
  formData: FormData
): Promise<ProgramFormState> {
  const actor = await requireUser();
  const parsed = programInputSchema.safeParse(readFormInput(formData));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await createProgram(actor, parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create program." };
  }

  revalidatePath("/programs");
  return { success: true };
}

export async function updateProgramAction(
  id: number,
  _prev: ProgramFormState,
  formData: FormData
): Promise<ProgramFormState> {
  const actor = await requireUser();
  const parsed = programInputSchema.safeParse(readFormInput(formData));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await updateProgram(actor, id, parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update program." };
  }

  revalidatePath("/programs");
  return { success: true };
}
