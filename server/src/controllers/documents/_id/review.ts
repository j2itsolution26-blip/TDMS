import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { documentReviewSchema } from '@/server/schemas/teaching';
import { reviewDocument } from '@/server/services/teaching/documents';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.reviewAcademicDocuments(user));
  const { action, note } = await parseJson(request, documentReviewSchema);
  await reviewDocument(user, idSchema.parse((await params).id), action, note, requestContext(request));
  return ok({ done: action });
});
