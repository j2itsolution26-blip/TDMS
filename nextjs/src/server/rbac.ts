import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/server/session";
import { permissionsForRoles } from "@/lib/permissions";

export { ROLE_PERMISSIONS, permissionsForRoles } from "@/lib/permissions";
export type { RoleName, Permission } from "@/lib/permissions";

export function userHasPermission(user: SessionUser, permission: string): boolean {
  // super_admin implicitly has every ability, mirroring the Laravel
  // app's Gate::before blanket grant in AppServiceProvider — kept as
  // an explicit, auditable rule here rather than an implicit bypass.
  if (user.roles.includes("super_admin")) return true;
  return permissionsForRoles(user.roles).has(permission);
}

export function userHasRole(user: SessionUser, roles: string[]): boolean {
  return user.roles.some((r) => roles.includes(r));
}

/**
 * Server-side authentication gate. Call this at the top of every
 * protected Server Component/Server Action/Route Handler — the
 * cookie-presence check in middleware.ts is only a fast UX redirect,
 * this is the actual enforcement.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!userHasPermission(user, permission)) redirect("/dashboard?error=forbidden");
  return user;
}

export async function requireRole(roles: string[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!userHasRole(user, roles)) redirect("/dashboard?error=forbidden");
  return user;
}
