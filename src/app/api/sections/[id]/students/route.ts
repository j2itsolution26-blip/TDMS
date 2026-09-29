import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/validation/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { rosterSchema } from '@/server/validation/teaching';
import { addSectionStudents, removeSectionStudent } from '@/server/services/teaching/class-setup';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  const { studentIds } = await parseJson(request, rosterSchema);
  return ok(await addSectionStudents(user, idSchema.parse((await params).id), studentIds, requestContext(request)));
});

export const DELETE = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  const studentId = idSchema.parse(request.nextUrl.searchParams.get('studentId') ?? '');
  await removeSectionStudent(user, idSchema.parse((await params).id), studentId, requestContext(request));
  return ok({ removed: true });
});
