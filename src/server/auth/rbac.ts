import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * Spatie laravel-permission stored role assignments polymorphically, keyed
 * on this literal string. The rows are reused untouched, so the constant
 * has to keep the PHP class name exactly.
 */
export const USER_MODEL_TYPE = 'App\\Models\\User';

export const GUARD = 'web';

export interface RoleAndPermissions {
  roles: string[];
  permissions: string[];
}

/**
 * Resolve a user's roles and their transitive permissions in one round trip.
 *
 * Mirrors Spatie's behaviour: a user's effective permissions are those
 * granted directly (model_has_permissions) plus every permission attached to
 * any role they hold (role_has_permissions). TDMS only ever uses role-based
 * grants, but direct grants are honoured so the data model stays faithful.
 */
export async function loadRolesAndPermissions(userId: bigint): Promise<RoleAndPermissions> {
  const [roleRows, directRows] = await Promise.all([
    prisma.modelHasRole.findMany({
      where: { modelId: userId, modelType: USER_MODEL_TYPE },
      select: {
        role: {
          select: {
            name: true,
            guardName: true,
            permissions: { select: { permission: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.modelHasPermission.findMany({
      where: { modelId: userId, modelType: USER_MODEL_TYPE },
      select: { permission: { select: { name: true, guardName: true } } },
    }),
  ]);

  const roles: string[] = [];
  const permissions = new Set<string>();

  for (const row of roleRows) {
    if (row.role.guardName !== GUARD) continue;
    roles.push(row.role.name);
    for (const p of row.role.permissions) permissions.add(p.permission.name);
  }

  for (const row of directRows) {
    if (row.permission.guardName === GUARD) permissions.add(row.permission.name);
  }

  return { roles, permissions: [...permissions] };
}
