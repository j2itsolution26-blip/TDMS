import { ok } from '@/server/lib/http';
import { withErrorHandling } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { sessionView } from '@/server/services/teaching/attendance';

type Params = { params: Promise<{ id: string }> };

/** The live list and counts; polled by the scanning screen. */
export const GET = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  return ok(await sessionView(user, idSchema.parse((await params).id)));
});
