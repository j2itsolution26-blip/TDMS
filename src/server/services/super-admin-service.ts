import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/http';
import { hashPassword } from '@/server/auth/password';
import { USER_MODEL_TYPE, GUARD } from '@/server/auth/rbac';
import { issueEmailVerificationToken } from '@/server/auth/tokens';
import { sendVerificationEmail } from '@/server/mail/messages';
import { checkInstitutionalEmail } from '@/lib/institutional-email';
import { recordAudit, type AuditContext } from './audit-log';

/**
 * First-time system setup.
 *
 * A fresh installation has roles and permissions but no users at all. This
 * creates the first Super Admin, and it is the only way to obtain one
 * through the web — there is no seeded administrator and no default
 * password anywhere in this codebase.
 *
 * The account is created PENDING_VERIFICATION with the password the operator
 * chose. It cannot sign in until the institutional address is confirmed,
 * which is what proves the person setting up the system actually holds a
 * college mailbox.
 *
 * The route is reachable only while no Super Admin exists, and the check is
 * repeated inside the transaction so it cannot be raced.
 */

export const SUPER_ADMIN_ROLE = 'super_admin';

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

export interface CreateSuperAdminResult {
  id: string;
  email: string;
  mailDelivered: boolean;
  mailDetail?: string;
}

export async function createSuperAdmin(
  input: CreateSuperAdminInput,
  context: AuditContext,
): Promise<CreateSuperAdminResult> {
  const check = checkInstitutionalEmail(input.email);
  if (!check.ok) throw new AppError(check.message!, 422, { email: [check.message!] });

  const passwordHash = await hashPassword(input.password);

  const created = await prisma
    .$transaction(
      async (tx) => {
        const role = await tx.role.upsert({
          where: { name_guardName: { name: SUPER_ADMIN_ROLE, guardName: GUARD } },
          create: {
            name: SUPER_ADMIN_ROLE,
            guardName: GUARD,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
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

        const clash = await tx.user.findUnique({
          where: { email: check.email },
          select: { id: true },
        });
        if (clash) {
          throw new AppError('An account already exists for that email address.', 422, {
            email: ['An account already exists for that email address.'],
          });
        }

        const user = await tx.user.create({
          data: {
            name: input.name.trim(),
            email: check.email,
            password: passwordHash,
            // Not verified, and therefore not yet able to sign in.
            emailVerifiedAt: null,
            status: 'PENDING_VERIFICATION',
            isActive: false,
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

  const { token, expiresAt } = await issueEmailVerificationToken(created.id, created.email);
  const mail = await sendVerificationEmail({
    to: created.email,
    name: created.name,
    token,
    expiresAt,
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
      mail_transport: mail.transport,
      mail_delivered: mail.delivered,
    },
    context,
  });

  return {
    id: created.id.toString(),
    email: created.email,
    mailDelivered: mail.delivered,
    mailDetail: mail.detail,
  };
}
