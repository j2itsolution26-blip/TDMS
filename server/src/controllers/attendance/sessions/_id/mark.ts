import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { markAttendanceSchema } from '@/server/schemas/teaching';
import { markStudent } from '@/server/services/teaching/attendance';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  const { studentId, status } = await parseJson(request, markAttendanceSchema);
  await markStudent(user, idSchema.parse((await params).id), studentId, status, requestContext(request));
  return ok({ saved: true });
});
