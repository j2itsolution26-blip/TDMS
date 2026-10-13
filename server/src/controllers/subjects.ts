import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { subjectPolicy } from '@/server/auth/policies';
import { subjectSchema } from '@/server/schemas/schemas';
import { listSubjects, createSubject } from '@/server/services/catalogue-service';

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(subjectPolicy.viewAny(user));
  const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
  return ok(await listSubjects(Number.isFinite(page) && page > 0 ? page : 1));
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(subjectPolicy.create(user));
  const input = await parseJson(request, subjectSchema);
  return ok(await createSubject(input), 201);
});
