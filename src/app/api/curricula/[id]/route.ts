import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { curriculumPolicy } from '@/server/auth/policies';
import { curriculumSchema, idSchema } from '@/server/validation/schemas';
import { getCurriculum, updateCurriculum, toggleCurriculumActive } from '@/server/services/catalogue-service';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(curriculumPolicy.view(user));
  const { id } = await params;
  return ok(await getCurriculum(idSchema.parse(id)));
});

export const PUT = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(curriculumPolicy.update(user));
  const { id } = await params;
  const parsedId = idSchema.parse(id);
  const existing = await getCurriculum(parsedId);
  const body = await request.json();
  const input = curriculumSchema.parse({ ...body, programId: existing.programId.toString() });
  return ok(await updateCurriculum(parsedId, input));
});

export const PATCH = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(curriculumPolicy.update(user));
  const { id } = await params;
  return ok(await toggleCurriculumActive(idSchema.parse(id)));
});
