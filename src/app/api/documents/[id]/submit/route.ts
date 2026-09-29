import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/validation/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { submitDocument } from '@/server/services/teaching/documents';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  await submitDocument(user, idSchema.parse((await params).id), requestContext(request));
  return ok({ submitted: true });
});
