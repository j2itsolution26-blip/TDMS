import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { roomSchema } from '@/server/schemas/teaching';
import { createRoom, listRooms } from '@/server/services/teaching/rooms';

/** GET /api/v1/rooms, POST /api/v1/rooms — those who schedule classes manage rooms. */
export const GET = withErrorHandling(async () => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  return ok(await listRooms());
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  return ok(await createRoom(user, await parseJson(request, roomSchema), requestContext(request)), 201);
});
