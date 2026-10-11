import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { suppliesPolicy } from '@/server/auth/policies';
import { inventoryItemSchema, supplyFilterSchema } from '@/server/schemas/supplies';
import { createInventoryItem, listInventory } from '@/server/services/supplies';

/** GET /api/v1/assessment/inventory?category= — items with good/defective counts and totals. */
export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(suppliesPolicy.view(user));
  const { category } = supplyFilterSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return ok(await listInventory(category));
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(suppliesPolicy.manage(user));
  return ok(await createInventoryItem(await parseJson(request, inventoryItemSchema), user, requestContext(request)), 201);
});
