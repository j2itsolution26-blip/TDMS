import { z } from 'zod';
import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson } from '@/server/lib/api-handler';
import { requireApiUser } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { getNotificationSummary, markNotificationsRead } from '@/server/services/teaching/notifications';

/** The signed-in user's own notifications — nobody else's, by construction. */
export const GET = withErrorHandling(async () => {
  const user = await requireApiUser();
  return ok(await getNotificationSummary(user));
});

const readSchema = z.object({ ids: z.array(idSchema).max(200).optional(), all: z.boolean().optional() });

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  const { ids, all } = await parseJson(request, readSchema);
  return ok({ marked: await markNotificationsRead(user, all ? 'all' : ids ?? []) });
});
