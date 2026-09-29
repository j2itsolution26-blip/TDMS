import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/validation/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { gradeNotesSchema } from '@/server/validation/teaching';
import { gradebook, saveGradeNotes } from '@/server/services/teaching/gradebook';

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  return ok(await gradebook(user, idSchema.parse((await params).id)));
});

export const PUT = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.teach(user));
  const { notes } = await parseJson(request, gradeNotesSchema);
  await saveGradeNotes(user, idSchema.parse((await params).id), notes, requestContext(request));
  return ok({ saved: true });
});
