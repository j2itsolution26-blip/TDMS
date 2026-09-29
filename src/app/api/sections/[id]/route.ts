import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/validation/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { sectionRenameSchema } from '@/server/validation/teaching';
import { deleteSection, renameSection, sectionRoster } from '@/server/services/teaching/class-setup';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  return ok(await sectionRoster(idSchema.parse((await params).id)));
});

export const PUT = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  const { name } = await parseJson(request, sectionRenameSchema);
  return ok(await renameSection(user, idSchema.parse((await params).id), name, requestContext(request)));
});

export const DELETE = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  await deleteSection(user, idSchema.parse((await params).id), requestContext(request));
  return ok({ deleted: true });
});
