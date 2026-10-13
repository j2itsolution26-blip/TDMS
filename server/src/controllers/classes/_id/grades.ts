import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { gradeNotesSchema } from '@/server/schemas/teaching';
import { gradebook, saveGradeNotes } from '@/server/services/teaching/gradebook';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  return ok(await gradebook(user, idSchema.parse((await params).id)));
});

export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  const { notes } = await parseJson(request, gradeNotesSchema);
  await saveGradeNotes(user, idSchema.parse((await params).id), notes, requestContext(request));
  return ok({ saved: true });
});
