import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { suppliesPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { purchaseStatusSchema } from '@/server/schemas/supplies';
import { setPurchaseStatus } from '@/server/services/supplies';

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/assessment/purchases/:id/status — move a purchase along; Delivered and Cancelled are final. */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(suppliesPolicy.manage(user));
  const { status, remarks } = await parseJson(request, purchaseStatusSchema);
  return ok(await setPurchaseStatus(idSchema.parse((await params).id), status, remarks, user, requestContext(request)));
});
