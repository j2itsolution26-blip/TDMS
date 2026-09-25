import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { subjectPolicy } from '@/server/auth/policies';
import { subjectSchema, idSchema } from '@/server/validation/schemas';
import { getSubject, updateSubject, toggleSubjectActive } from '@/server/services/catalogue-service';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(subjectPolicy.view(user));
  const { id } = await params;
  return ok(await getSubject(idSchema.parse(id)));
});

export const PUT = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(subjectPolicy.update(user));
  const { id } = await params;
  const input = await parseJson(request, subjectSchema);
  return ok(await updateSubject(idSchema.parse(id), input));
});

export const PATCH = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(subjectPolicy.update(user));
  const { id } = await params;
  return ok(await toggleSubjectActive(idSchema.parse(id)));
});
