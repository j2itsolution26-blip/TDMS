import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/http';
import { hashPassword } from '@/server/auth/password';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import { recordAudit, type AuditContext } from './audit-log';

/**
 * First-run setup: creating the one initial Super Admin of a new installation.
 *
 * The installation is INITIALIZED once a `system_installation` row exists, or
 * once any user exists at all (a database provisioned before that table, or
 * one an operator filled by hand). Either is enough to close /setup for good;
 * only `npm run db:fresh` reopens it.
 *
 * WHAT MAKES IT SINGLE-USE. The checks before the transaction are for a good
 * message; the transaction is the guarantee. It re-checks for users and then
 * inserts the installation row, whose primary key is pinned to 1. Two
 * concurrent setups both reach that insert; one commits, and the other fails
 * on the key and creates nothing.
 */

export const SUPER_ADMIN_ROLE = 'super_admin';


export const ALREADY_INITIALIZED = 'TDMS has already been initialized.';

/** True once first-run setup is over. Checked on the server, every time. */
export async function isSystemInitialized(): Promise<boolean> {
  const [installation, users] = await Promise.all([
    prisma.systemInstallation.findUnique({ where: { id: 1 }, select: { id: true } }),
    prisma.user.count(),
  ]);
  return installation !== null || users > 0;
}

export interface InitialSetupInput {
  name: string;
  /** Already normalized and checked against the domain policy by the schema. */
  email: string;
  /** Already checked against the password policy by the schema. */
  password: string;
}

export async function completeInitialSetup(
  input: InitialSetupInput,
  context: AuditContext,
): Promise<{ email: string }> {
  if (await isSystemInitialized()) throw new AppError(ALREADY_INITIALIZED, 409);

  // Hashed before the transaction: Argon2id is deliberately slow, and the
  // transaction should hold its locks for as short a time as possible.
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  const created = await prisma
    .$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) throw new AppError(ALREADY_INITIALIZED, 409);

      // The race-deciding write. A concurrent setup blocks here until this
      // transaction ends, then fails on the primary key.
      await tx.systemInstallation.create({
        data: { id: 1, initializedAt: now, method: 'setup' },
      });

      const role = await tx.role.upsert({
        where: { name_guardName: { name: SUPER_ADMIN_ROLE, guardName: GUARD } },
        create: { name: SUPER_ADMIN_ROLE, guardName: GUARD, createdAt: now, updatedAt: now },
        update: {},
      });

      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          password: passwordHash,
          // The password was chosen here, by its owner. Not a temporary one.
          mustChangePassword: false,
          passwordChangedAt: now,
          // The password was chosen here, by its owner. Not a temporary one.
          emailVerifiedAt: now,
          status: 'ACTIVE',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        select: { id: true, name: true, email: true },
      });

      await tx.modelHasRole.create({
        data: { roleId: role.id, modelType: USER_MODEL_TYPE, modelId: user.id },
      });

      return user;
    })
    .catch((error) => {
      if (error instanceof AppError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(ALREADY_INITIALIZED, 409);
      }
      throw error;
    });

  await recordAudit({
    action: 'INITIAL_SUPER_ADMIN_CREATED',
    actor: 'SYSTEM_SETUP',
    target: `Super Admin Account (${created.email})`,
    details: {
      user_id: created.id.toString(),
      name: created.name,
      email: created.email,
      role: SUPER_ADMIN_ROLE,
      method: 'setup',
    },
    context,
  });

  return { email: created.email };
}
