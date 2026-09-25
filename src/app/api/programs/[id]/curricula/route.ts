import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { curriculumPolicy } from '@/server/auth/policies';
import { curriculumSchema, idSchema } from '@/server/validation/schemas';
import { listCurriculaForProgram, createCurriculum } from '@/server/services/catalogue-service';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(curriculumPolicy.viewAny(user));
  const { id } = await params;
  return ok(await listCurriculaForProgram(idSchema.parse(id)));
});

export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(curriculumPolicy.create(user));
  const { id } = await params;
  const body = await request.json();
  const input = curriculumSchema.parse({ ...body, programId: id });
  return ok(await createCurriculum(input), 201);
});
