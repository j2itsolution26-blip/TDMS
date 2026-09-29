import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/validation/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { markAttendanceSchema } from '@/server/validation/teaching';
import { markStudent } from '@/server/services/teaching/attendance';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  const { studentId, status } = await parseJson(request, markAttendanceSchema);
  await markStudent(user, idSchema.parse((await params).id), studentId, status, requestContext(request));
  return ok({ saved: true });
});
