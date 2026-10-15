import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { roomSchema } from '@/server/schemas/teaching';
import { updateRoom } from '@/server/services/teaching/rooms';

type Params = { params: Promise<{ id: string }> };

/** PUT /api/v1/rooms/:id — rename, retype, resize, or (de)activate a room. */
export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  await updateRoom(user, idSchema.parse((await params).id), await parseJson(request, roomSchema), requestContext(request));
  return ok({ saved: true });
});
