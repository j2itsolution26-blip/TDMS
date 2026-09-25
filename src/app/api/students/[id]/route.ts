import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { studentPolicy } from '@/server/auth/policies';
import { studentSchema, idSchema } from '@/server/validation/schemas';
import { getStudent, updateStudent } from '@/server/services/student-service';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(studentPolicy.view(user));
  const { id } = await params;
  return ok(await getStudent(idSchema.parse(id)));
});

export const PUT = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(studentPolicy.update(user));
  const { id } = await params;
  const input = await parseJson(request, studentSchema);
  return ok(await updateStudent(idSchema.parse(id), input));
});
