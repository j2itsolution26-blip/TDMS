import { ok } from '@/server/lib/http';
import { withErrorHandling } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { getAdminCredentials } from '@/server/services/admin-account-service';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admins/:id/credentials — the credentials modal.
 *
 * Status only: the Admin, whether a temporary password can be shown, and the
 * current access code's state. No password and no code is ever in this
 * response; the password is fetched separately, on purpose, by the reveal POST.
 */
export const GET = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(adminAccountPolicy.viewAny(user));
  const { id } = await params;
  return ok(await getAdminCredentials(idSchema.parse(id)));
});
