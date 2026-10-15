import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { curriculumSubjectPolicy } from '@/server/auth/policies';
import { curriculumSubjectUpdateSchema, idSchema } from '@/server/schemas/schemas';
import { removeCurriculumSubject, updateCurriculumSubject } from '@/server/services/catalogue-service';

type Params = { params: Promise<{ id: string; entryId: string }> };

export const DELETE = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(curriculumSubjectPolicy.delete(user));
  const { id, entryId } = await params;
  // The curriculum id is passed too, so a crafted entry id cannot delete a
  // row belonging to a different curriculum.
  await removeCurriculumSubject(idSchema.parse(entryId), idSchema.parse(id));
  return ok({ deleted: true });
});

/** PUT — change a mapping's units, required/elective and prerequisites. */
export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(curriculumSubjectPolicy.update(user));
  const { id, entryId } = await params;
  await updateCurriculumSubject(idSchema.parse(entryId), idSchema.parse(id), await parseJson(request, curriculumSubjectUpdateSchema));
  return ok({ saved: true });
});
