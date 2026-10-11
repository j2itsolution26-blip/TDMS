import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { announcementPolicy } from '@/server/auth/policies';
import { announcementSchema } from '@/server/schemas/supplies';
import { announcementsFor, publishAnnouncement } from '@/server/services/announcements';

/** GET /api/v1/announcements — the announcements addressed to the caller (all of them, for a publisher). */
export const GET = withErrorHandling(async () => {
  const user = await requireApiUser();
  return ok(await announcementsFor(user));
});

/** POST /api/v1/announcements — publish, and notify every recipient. */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(announcementPolicy.manage(user));
  return ok(await publishAnnouncement(await parseJson(request, announcementSchema), user, requestContext(request)), 201);
});
