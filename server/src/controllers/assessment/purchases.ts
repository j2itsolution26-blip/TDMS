import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { suppliesPolicy } from '@/server/auth/policies';
import { purchaseSchema, supplyFilterSchema } from '@/server/schemas/supplies';
import { createPurchase, listPurchases } from '@/server/services/supplies';

/** GET /api/v1/assessment/purchases?category=&status= */
export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(suppliesPolicy.view(user));
  return ok(await listPurchases(supplyFilterSchema.parse(Object.fromEntries(new URL(request.url).searchParams))));
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(suppliesPolicy.manage(user));
  return ok(await createPurchase(await parseJson(request, purchaseSchema), user, requestContext(request)), 201);
});
