import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { studentCredentialPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/validation/schemas';
import { listStudentCredentials } from '@/server/services/enrollment-service';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(studentCredentialPolicy.viewAny(user));
  const { id } = await params;
  return ok(await listStudentCredentials(idSchema.parse(id)));
});
