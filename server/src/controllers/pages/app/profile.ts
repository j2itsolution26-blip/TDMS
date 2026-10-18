import { requireUser } from '@/server/auth/current-user';
import { prisma } from '@/server/lib/prisma';
import { accountActivity } from '@/server/services/account-activity';
import { ROLE_LABELS, type RoleName } from '@shared/types/domain';
import type { PageRequest } from '@/server/controllers/pages/types';

/**
 * My Profile — the signed-in person's own account, whatever their role. Only
 * what the account really holds: no field is invented, and the role is shown,
 * never editable. The password hash never leaves the server.
 */

export async function loadProfile(_request: PageRequest) {
  const user = await requireUser();
  const id = BigInt(user.id);

  const [account, activity] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        createdAt: true,
        lastLoginAt: true,
        passwordChangedAt: true,
        avatarUrl: true,
        googleId: true,
        student: { select: { studentNumber: true, program: { select: { code: true, name: true } } } },
      },
    }),
    accountActivity(user),
  ]);

  return {
    user: {
      name: user.name,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerifiedAt !== null,
      status: user.status,
      roles: user.roles.map((r) => ROLE_LABELS[r as RoleName] ?? r),
      createdAt: account?.createdAt?.toISOString() ?? null,
      lastLoginAt: account?.lastLoginAt?.toISOString() ?? null,
      passwordChangedAt: account?.passwordChangedAt?.toISOString() ?? null,
      // The Google profile photo, when the account signed in with Google.
      avatarUrl: account?.avatarUrl ?? null,
      googleLinked: Boolean(account?.googleId),
      // A student's own record: their program and student number.
      student: account?.student
        ? { studentNumber: account.student.studentNumber, program: `${account.student.program.code} · ${account.student.program.name}` }
        : null,
    },
    activity,
  };
}
