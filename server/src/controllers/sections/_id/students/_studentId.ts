import { ok } from '@/server/lib/http';
import { withErrorHandling } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { idSchema } from '@/server/schemas/schemas';
import { teachingPolicy } from '@/server/auth/policies';
import { sectionStudentProfile } from '@/server/services/teaching/class-setup';

type Params = { params: Promise<{ id: string; studentId: string }> };

/**
 * GET /api/v1/sections/:id/students/:studentId — one student of the section,
 * for the roster's Student Information panel. Same permission as the roster;
 * 404 unless the student is in this section; personal details, documents and
 * account status only for roles already allowed to see them.
 */
export const GET = withErrorHandling(async (_request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(teachingPolicy.manageClasses(user));
  const { id, studentId } = await params;
  return ok(await sectionStudentProfile(user, idSchema.parse(id), idSchema.parse(studentId)));
});
