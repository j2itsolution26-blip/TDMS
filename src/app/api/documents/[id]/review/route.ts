import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/validation/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { documentReviewSchema } from '@/server/validation/teaching';
import { reviewDocument } from '@/server/services/teaching/documents';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.reviewAcademicDocuments(user));
  const { action, note } = await parseJson(request, documentReviewSchema);
  await reviewDocument(user, idSchema.parse((await params).id), action, note, requestContext(request));
  return ok({ done: action });
});
