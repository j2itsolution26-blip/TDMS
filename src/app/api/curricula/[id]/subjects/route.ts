import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { curriculumSubjectPolicy } from '@/server/auth/policies';
import { curriculumSubjectSchema, idSchema } from '@/server/validation/schemas';
import { listCurriculumSubjects, addCurriculumSubject } from '@/server/services/catalogue-service';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(curriculumSubjectPolicy.viewAny(user));
  const { id } = await params;
  return ok(await listCurriculumSubjects(idSchema.parse(id)));
});

export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(curriculumSubjectPolicy.create(user));
  const { id } = await params;
  const body = await request.json();
  const input = curriculumSubjectSchema.parse({ ...body, curriculumId: id });
  return ok(await addCurriculumSubject(input), 201);
});
