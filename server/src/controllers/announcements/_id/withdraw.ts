import { ok } from '@/server/lib/http';
import { withErrorHandling, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { announcementPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { withdrawAnnouncement } from '@/server/services/announcements';

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/announcements/:id/withdraw — hide it from readers; the record is kept. */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(announcementPolicy.manage(user));
  await withdrawAnnouncement(idSchema.parse((await params).id), user, requestContext(request));
  return ok({ withdrawn: true });
});
