import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { programPolicy } from '@/server/auth/policies';
import { programSchema } from '@/server/validation/schemas';
import { listPrograms, createProgram } from '@/server/services/catalogue-service';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(programPolicy.viewAny(user));
  const page = Number(request.nextUrl.searchParams.get('page') ?? 1);
  return ok(await listPrograms(Number.isFinite(page) && page > 0 ? page : 1));
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(programPolicy.create(user));
  const input = await parseJson(request, programSchema);
  return ok(await createProgram(input), 201);
});
