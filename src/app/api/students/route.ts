import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { studentPolicy } from '@/server/auth/policies';
import { studentSchema } from '@/server/validation/schemas';
import { listStudents, createStudent } from '@/server/services/student-service';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(studentPolicy.viewAny(user));
  const sp = request.nextUrl.searchParams;
  const page = Number(sp.get('page') ?? 1);
  return ok(
    await listStudents({
      page: Number.isFinite(page) && page > 0 ? page : 1,
      search: sp.get('search') ?? undefined,
    }),
  );
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(studentPolicy.create(user));
  const input = await parseJson(request, studentSchema);
  return ok(await createStudent(input), 201);
});
