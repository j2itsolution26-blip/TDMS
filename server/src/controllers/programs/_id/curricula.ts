import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { curriculumPolicy } from '@/server/auth/policies';
import { curriculumSchema, idSchema } from '@/server/schemas/schemas';
import { listCurriculaForProgram, createCurriculum } from '@/server/services/catalogue-service';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(curriculumPolicy.viewAny(user));
  const { id } = await params;
  return ok(await listCurriculaForProgram(idSchema.parse(id)));
});

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(curriculumPolicy.create(user));
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>; // Zod validates it below
  const input = curriculumSchema.parse({ ...body, programId: id });
  return ok(await createCurriculum(input), 201);
});
