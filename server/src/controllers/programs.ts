import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { programPolicy } from '@/server/auth/policies';
import { programSchema } from '@/server/schemas/schemas';
import { listPrograms, createProgram } from '@/server/services/catalogue-service';

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(programPolicy.viewAny(user));
  const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
  return ok(await listPrograms(Number.isFinite(page) && page > 0 ? page : 1));
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(programPolicy.create(user));
  const input = await parseJson(request, programSchema);
  return ok(await createProgram(input), 201);
});
