import { ok } from '@/server/lib/http';
import { withErrorHandling } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { studentPolicy } from '@/server/auth/policies';
import { studentSchema } from '@/server/schemas/schemas';
import { listStudents, createStudent } from '@/server/services/student-service';
import { registrationTerm } from '@/server/services/registration-enrollment';
import { registrationTermSchema } from '@/server/schemas/schemas';

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(studentPolicy.viewAny(user));
  const sp = new URL(request.url).searchParams;
  const page = Number(sp.get('page') ?? 1);
  return ok(
    await listStudents({
      page: Number.isFinite(page) && page > 0 ? page : 1,
      search: sp.get('search') ?? undefined,
    }),
  );
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(studentPolicy.create(user));
  const body = await request.json().catch(() => null);
  const input = studentSchema.parse(body);
  // The term the new student is enrolled into (pending): the one chosen, or the active one.
  const choice = registrationTermSchema.parse(body ?? {});
  const term = await registrationTerm(choice.schoolYearId ? { schoolYearId: choice.schoolYearId, semester: choice.semester ?? 1 } : null);
  return ok(await createStudent(input, term), 201);
});
