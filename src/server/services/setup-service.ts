import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/http';
import { hashPassword } from '@/server/auth/password';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import { consumeRateLimit } from '@/server/auth/rate-limit';
import { setupKeyProblem, setupKeyMatches } from '@/server/auth/setup-key';
import { recordAudit, type AuditContext } from './audit-log';

/**
 * First-run setup: creating the one initial Super Admin of a new installation.
 *
 * The installation is INITIALIZED once a `system_installation` row exists, or
 * once any user exists at all (a database provisioned before that table, or
 * one an operator filled by hand). Either is enough to close /setup for good;
 * only `npm run db:fresh` reopens it.
 *
 * WHO MAY DO IT. Being first is not proof of anything — on a public
 * deployment, the first visitor to /setup could be anyone. So completing
 * setup also requires SETUP_KEY, a value that exists only in the server's
 * environment. Whoever can set an environment variable on the server is the
 * operator; whoever cannot, cannot claim the system. See
 * src/server/auth/setup-key.ts.
 *
 * WHAT MAKES IT SINGLE-USE. The checks before the transaction are for a good
 * message; the transaction is the guarantee. It re-checks for users and then
 * inserts the installation row, whose primary key is pinned to 1. Two
 * concurrent setups both reach that insert; one commits, and the other fails
 * on the key and creates nothing.
 */

export const SUPER_ADMIN_ROLE = 'super_admin';

/** Key guesses per IP. Generous for a person, useless for a brute force. */
const SETUP_ATTEMPTS_PER_IP = { max: 10, windowSeconds: 900 };

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
  setupKey: string;
}

export async function completeInitialSetup(
  input: InitialSetupInput,
  context: AuditContext,
): Promise<{ email: string }> {
  if (await isSystemInitialized()) throw new AppError(ALREADY_INITIALIZED, 409);

  const problem = setupKeyProblem();
  if (problem) throw new AppError(problem, 503, undefined, 'SETUP_KEY_NOT_CONFIGURED');

  // Counted before the key is checked, so wrong guesses use up the budget.
  const budget = await consumeRateLimit('setup', context.ip ?? 'unknown', SETUP_ATTEMPTS_PER_IP);
  if (budget.limited) {
    throw new AppError(
      `Too many setup attempts. Please try again in ${budget.retryAfterSeconds} seconds.`,
      429,
    );
  }

  if (!setupKeyMatches(input.setupKey)) {
    await recordAudit({
      action: 'INITIAL_SETUP_KEY_REJECTED',
      actor: 'SYSTEM_SETUP',
      target: 'First-run setup',
      context,
    });
    throw new AppError('That setup key is not correct.', 403, {
      setupKey: ['That setup key is not correct.'],
    });
  }

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
          // Provisioned by whoever holds the server's SETUP_KEY — the same
          // reasoning as `npm run admin:create`.
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
