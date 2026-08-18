"use server";

import { redirect } from "next/navigation";
import { destroySession, getSessionUser } from "@/server/session";
import { recordAudit } from "@/server/audit";

export async function logout(): Promise<void> {
  const user = await getSessionUser();
  if (user) {
    await recordAudit({
      action: "LOGOUT",
      actor: { name: user.name, email: user.email },
      target: `${user.name} <${user.email}>`,
    });
  }
  await destroySession();
  redirect("/login");
}
