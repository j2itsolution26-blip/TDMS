import { ok } from '@/server/lib/http';
import { NotFoundError } from '@/server/lib/http';
import { withErrorHandling } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { getAccessCode } from '@/server/services/admin-account-service';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin-access-codes/:id — the View dialog.
 *
 * Who the code belongs to, who issued it, its status and its history. Not the
 * code: that was shown once, when it was generated, and only its hash is kept.
 */
export const GET = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(adminAccountPolicy.manageAccessCodes(user));
  const { id } = await params;
  const row = await getAccessCode(idSchema.parse(id));
  if (!row) throw new NotFoundError('That access code was not found.');
  return ok(row);
});
