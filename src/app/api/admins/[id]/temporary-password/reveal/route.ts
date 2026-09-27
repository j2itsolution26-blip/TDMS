import type { NextRequest } from 'next/server';
import { okSecret } from '@/lib/http';
import { withErrorHandling, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/validation/schemas';
import { revealTemporaryPassword } from '@/server/services/admin-account-service';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admins/:id/temporary-password/reveal — show a temporary password.
 *
 * Super Admin only, and a POST rather than a GET so that no prefetch, link
 * preview or history entry can trigger it and nothing is ever put in a URL.
 * The response is `no-store`. Each reveal is audited (TEMP_PASSWORD_REVEALED),
 * and only a password that is still temporary can be shown: a permanent one is
 * never stored recoverably.
 */
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  const { id } = await params;
  const targetId = idSchema.parse(id);
  authorize(adminAccountPolicy.resetTemporaryPassword(user, { id: targetId.toString(), roles: [] }));
  return okSecret(await revealTemporaryPassword(user, targetId, requestContext(request)));
});
