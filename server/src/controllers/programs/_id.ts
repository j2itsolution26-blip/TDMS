import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { programPolicy } from '@/server/auth/policies';
import { programSchema, idSchema } from '@/server/schemas/schemas';
import { getProgram, updateProgram, toggleProgramActive } from '@/server/services/catalogue-service';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(programPolicy.view(user));
  const { id } = await params;
  return ok(await getProgram(idSchema.parse(id)));
});

export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(programPolicy.update(user));
  const { id } = await params;
  const input = await parseJson(request, programSchema);
  return ok(await updateProgram(idSchema.parse(id), input));
});

/** PATCH flips is_active - the Volt toggleActive() action. */
export const PATCH = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(programPolicy.update(user));
  const { id } = await params;
  return ok(await toggleProgramActive(idSchema.parse(id)));
});
