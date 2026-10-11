import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { suppliesPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { inventoryItemSchema } from '@/server/schemas/supplies';
import { deleteInventoryItem, updateInventoryItem } from '@/server/services/supplies';

type Params = { params: Promise<{ id: string }> };

export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(suppliesPolicy.manage(user));
  return ok(await updateInventoryItem(idSchema.parse((await params).id), await parseJson(request, inventoryItemSchema), user, requestContext(request)));
});

export const DELETE = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(suppliesPolicy.manage(user));
  await deleteInventoryItem(idSchema.parse((await params).id), user, requestContext(request));
  return ok({ deleted: true });
});
