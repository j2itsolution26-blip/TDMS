import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/http';
import { hashPassword } from '@/server/auth/password';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import { recordAudit, type AuditContext } from './audit-log';

/**
 * Port of App\Services\SuperAdminBootstrapService.
 *
 * One-time system initialisation: creates the very first Super Admin when
 * none exists. The route that exposes it is gated by the same check, which
 * is what the EnsureSuperAdminNotBootstrapped middleware enforced.
 */

export const SUPER_ADMIN_ROLE = 'super_admin';

/** True only while the system has no Super Admin at all. */
export async function isBootstrapAllowed(): Promise<boolean> {
  const role = await prisma.role.findFirst({
    where: { name: SUPER_ADMIN_ROLE, guardName: GUARD },
    select: { id: true },
  });
  if (!role) return true;

  const existing = await prisma.modelHasRole.findFirst({
    where: { roleId: role.id, modelType: USER_MODEL_TYPE },
    select: { modelId: true },
  });

  return existing === null;
}

export interface CreateSuperAdminInput {
  name: string;
  email: string;
  password: string;
}

/**
 * Create the first Super Admin.
 *
 * The Laravel version took a 10-second cache lock so two simultaneous
 * submissions could not both pass the exists-check. Here the guarantee
 * comes from the database instead: the whole thing runs in a Serializable
 * transaction that re-checks inside the transaction, so concurrent callers
 * conflict and one is rolled back. That is stronger than an advisory lock
 * and needs no extra infrastructure on serverless.
 */
export async function createSuperAdmin(
  input: CreateSuperAdminInput,
  context: AuditContext,
): Promise<{ id: string; email: string }> {
  const passwordHash = await hashPassword(input.password);
  const email = input.email.toLowerCase();

  const created = await prisma
    .$transaction(
      async (tx) => {
        const role = await tx.role.upsert({
          where: { name_guardName: { name: SUPER_ADMIN_ROLE, guardName: GUARD } },
          create: { name: SUPER_ADMIN_ROLE, guardName: GUARD, createdAt: new Date(), updatedAt: new Date() },
          update: {},
        });

        const already = await tx.modelHasRole.findFirst({
          where: { roleId: role.id, modelType: USER_MODEL_TYPE },
          select: { modelId: true },
        });
        if (already) {
          throw new AppError(
            'Super Admin setup has already been completed. Please log in using the existing administrator account.',
            409,
          );
        }

        const clash = await tx.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
          select: { id: true },
        });
        if (clash) {
          throw new AppError('That email address is already in use.', 422, {
            email: ['That email address is already in use.'],
          });
        }

        const user = await tx.user.create({
          data: {
            name: input.name,
            email,
            password: passwordHash,
            emailVerifiedAt: new Date(),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        await tx.modelHasRole.create({
          data: { roleId: role.id, modelType: USER_MODEL_TYPE, modelId: user.id },
        });

        return user;
      },
      { isolationLevel: 'Serializable' },
    )
    .catch((error) => {
      if (error instanceof AppError) throw error;
      // A serialization failure means another request won the race.
      throw new AppError(
        'Super Admin setup is already being completed by another request. Please wait a moment and refresh.',
        409,
      );
    });

  await recordAudit({
    action: 'INITIAL_SUPER_ADMIN_CREATED',
    actor: 'SYSTEM_BOOTSTRAP',
    target: `Super Admin Account (${created.email})`,
    details: {
      user_id: created.id.toString(),
      name: created.name,
      email: created.email,
      role: SUPER_ADMIN_ROLE,
    },
    context,
  });

  return { id: created.id.toString(), email: created.email };
}
