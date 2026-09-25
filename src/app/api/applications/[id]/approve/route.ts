import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { applicationPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/validation/schemas';
import { approveApplication } from '@/server/services/application-service';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(applicationPolicy.review(user));
  const { id } = await params;
  return ok(await approveApplication(idSchema.parse(id), BigInt(user.id)));
});
