import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/validation/schemas';
import { revokeAdminAccessCode } from '@/server/services/admin-account-service';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin-access-codes/:id/revoke — withdraw an ACTIVE code.
 *
 * A used, expired or already-revoked code is refused with 409: it already
 * cannot let anybody in, and revoking it would rewrite what happened to it.
 */
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(adminAccountPolicy.manageAccessCodes(user));
  const { id } = await params;
  return ok(await revokeAdminAccessCode(user, idSchema.parse(id), requestContext(request)));
});
