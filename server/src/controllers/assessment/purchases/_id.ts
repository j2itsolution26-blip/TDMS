import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { suppliesPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { purchaseSchema } from '@/server/schemas/supplies';
import { updatePurchase } from '@/server/services/supplies';

type Params = { params: Promise<{ id: string }> };

/** PUT /api/v1/assessment/purchases/:id — edit a purchase that is not yet delivered or cancelled. */
export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(suppliesPolicy.manage(user));
  return ok(await updatePurchase(idSchema.parse((await params).id), await parseJson(request, purchaseSchema), user, requestContext(request)));
});
