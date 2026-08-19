"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/rbac";
import {
  createStaff,
  updateStaff,
  toggleStaffActive,
  resetStaffPassword,
  staffInputSchema,
} from "@/services/staff.service";

export type StaffFormState = { error?: string; success?: boolean; generatedPassword?: string };

function readFormInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  };
}

export async function createStaffAction(
  _prev: StaffFormState,
  formData: FormData
): Promise<StaffFormState> {
  const actor = await requireUser();
  const parsed = staffInputSchema.safeParse(readFormInput(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const { generatedPassword } = await createStaff(actor, parsed.data);
    revalidatePath("/staff");
    return { success: true, generatedPassword };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create staff account." };
  }
}

export async function updateStaffAction(
  id: number,
  _prev: StaffFormState,
  formData: FormData
): Promise<StaffFormState> {
  const actor = await requireUser();
  const parsed = staffInputSchema.safeParse(readFormInput(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await updateStaff(actor, id, parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update staff account." };
  }

  revalidatePath("/staff");
  return { success: true };
}

export async function toggleActiveAction(id: number): Promise<void> {
  const actor = await requireUser();
  await toggleStaffActive(actor, id);
  revalidatePath("/staff");
}

export type ResetPasswordState = { generatedPassword?: string; error?: string };

export async function resetPasswordAction(
  id: number,
  _prev: ResetPasswordState,
  _formData: FormData
): Promise<ResetPasswordState> {
  const actor = await requireUser();
  try {
    const generatedPassword = await resetStaffPassword(actor, id);
    revalidatePath("/staff");
    return { generatedPassword };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reset password." };
  }
}
