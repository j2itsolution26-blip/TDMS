import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson } from '@/server/api-handler';
import { requireApiUser } from '@/server/auth/current-user';
import { updatePasswordSchema } from '@/server/validation/schemas';
import { updatePassword } from '@/server/services/profile-service';
import { recordAudit } from '@/server/services/audit-log';
import { requestContext } from '@/server/api-handler';

/**
 * POST /api/auth/change-password — replace a temporary password.
 *
 * The ONE endpoint that accepts a caller still carrying
 * `mustChangePassword`. Every other route refuses them, so an Admin cannot
 * work through the API on a credential two people know while declining to
 * replace it.
 *
 * The current password is still required. The caller typed it minutes ago at
 * the sign-in screen, so asking again costs almost nothing — and it means an
 * unattended browser on this screen is not a way to take over the account.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser({ allowTemporaryPassword: true });
  const input = await parseJson(request, updatePasswordSchema);

  const wasTemporary = user.mustChangePassword;

  await updatePassword(BigInt(user.id), input);

  await recordAudit({
    action: wasTemporary ? 'ADMIN_TEMP_PASSWORD_REPLACED' : 'ACCOUNT_PASSWORD_CHANGED',
    actor: `${user.name} <${user.email}>`,
    target: `${user.name} <${user.email}>`,
    // Whether it happened, never what it was.
    details: { replaced_temporary_password: wasTemporary },
    context: requestContext(request),
  });

  return ok({ updated: true, redirectTo: '/dashboard' });
});
