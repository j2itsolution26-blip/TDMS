import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import { adminStatusChangeSchema, idSchema } from '@/server/validation/schemas';
import { setAdminAccountStatus } from '@/server/services/admin-account-service';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admins/:id/status — suspend or reactivate.
 *
 * ACTIVE or SUSPENDED, and nothing else. There is no approval state for an
 * Admin to sit in, so there is none to move it to.
 *
 * This is the one privileged operation on this screen that does NOT ask for
 * the Super Admin security code. It issues no credential, it is reversible,
 * and suspending an account is the last action anybody should have to hunt
 * for a secret before performing.
 */
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  const { id } = await params;
  const targetId = idSchema.parse(id);

  authorize(adminAccountPolicy.setStatus(user, { id: targetId.toString(), roles: [] }));

  const { status } = await parseJson(request, adminStatusChangeSchema);

  return ok({
    status: await setAdminAccountStatus(user, targetId, status, requestContext(request)),
  });
});
