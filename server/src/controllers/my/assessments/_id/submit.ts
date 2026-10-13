import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { studentPortalPolicy } from '@/server/auth/policies';
import { submitAttemptSchema } from '@/server/schemas/teaching';
import { submitAttempt } from '@/server/services/teaching/assessments';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(studentPortalPolicy.use(user));
  const { answers, final } = await parseJson(request, submitAttemptSchema);
  return ok(await submitAttempt(user, idSchema.parse((await params).id), answers, final));
});
