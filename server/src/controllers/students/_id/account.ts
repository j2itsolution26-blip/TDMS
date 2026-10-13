import { z } from 'zod';
import { okSecret } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { studentAccountPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { createStudentAccount } from '@/server/services/student-accounts';

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /** Sign-in address; the student record's own email when left empty. */
  email: z.string().trim().max(255).nullish().transform((v) => (v ? v : null)),
});

/**
 * POST /api/v1/students/:id/account — create the student's login.
 *
 * Admin only (accounts.manage). Refused unless the student has an Enrolled
 * enrollment and no login yet (409 STUDENT_NOT_ENROLLED / ACCOUNT_ALREADY_EXISTS).
 * Answers the temporary password once, not cached.
 */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(studentAccountPolicy.create(user));
  const { email } = await parseJson(request, bodySchema);
  return okSecret(await createStudentAccount(user, idSchema.parse((await params).id), email, requestContext(request)), 201);
});
