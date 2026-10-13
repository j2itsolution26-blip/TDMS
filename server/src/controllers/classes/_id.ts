import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { classUpdateSchema } from '@/server/schemas/teaching';
import { deleteClass, updateClass } from '@/server/services/teaching/class-setup';

type Params = { params: Promise<{ id: string }> };

export const PUT = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  await updateClass(user, idSchema.parse((await params).id), await parseJson(request, classUpdateSchema), requestContext(request));
  return ok({ saved: true });
});

export const DELETE = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  await deleteClass(user, idSchema.parse((await params).id), requestContext(request));
  return ok({ deleted: true });
});
