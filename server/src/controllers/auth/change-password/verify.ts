import { z } from 'zod';
import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson } from '@/server/lib/api-handler';
import { requireApiUser } from '@/server/auth/current-user';
import { checkTemporaryPassword, TEMPORARY_PASSWORD_MESSAGES } from '@/server/services/profile-service';

/**
 * POST /api/auth/change-password/verify — is this the right temporary password?
 *
 * Powers the green "Temporary password verified." on the setup screen, so the
 * person knows the first field is right before they invent a new password.
 * It changes nothing; POST /api/auth/change-password re-verifies on submit and
 * is what actually decides.
 *
 * Same gate as that endpoint: a signed-in session still carrying
 * `mustChangePassword`, the user taken from the session and never from the
 * body. Throttled separately (see checkTemporaryPassword), and answered with a
 * boolean — no hint of how close a wrong guess was.
 */
const schema = z.object({ currentPassword: z.string().min(1).max(200) });

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser({ allowTemporaryPassword: true });
  const input = await parseJson(request, schema);

  const { valid } = await checkTemporaryPassword(BigInt(user.id), input.currentPassword);

  return ok({
    valid,
    message: valid ? TEMPORARY_PASSWORD_MESSAGES.verified : TEMPORARY_PASSWORD_MESSAGES.incorrect,
  });
});
