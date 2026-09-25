import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { curriculumSubjectPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/validation/schemas';
import { removeCurriculumSubject } from '@/server/services/catalogue-service';

type Params = { params: Promise<{ id: string; entryId: string }> };

export const DELETE = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(curriculumSubjectPolicy.delete(user));
  const { id, entryId } = await params;
  // The curriculum id is passed too, so a crafted entry id cannot delete a
  // row belonging to a different curriculum.
  await removeCurriculumSubject(idSchema.parse(entryId), idSchema.parse(id));
  return ok({ deleted: true });
});
