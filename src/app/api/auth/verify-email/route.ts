import type { NextRequest } from 'next/server';
import { ok, AppError } from '@/lib/http';
import { withErrorHandling, parseJson } from '@/server/api-handler';
import { verifyEmail } from '@/server/services/account-service';
import { issuePasswordResetToken } from '@/server/auth/tokens';
import { verifyTokenSchema } from '@/server/validation/schemas';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/auth/verify-email
 *
 * Consumes a single-use verification token. Public by necessity — the
 * recipient is, by definition, not signed in yet. The token itself is the
 * credential, and it is single-use and expiring.
 *
 * An invited account has no usable password, so on success a reset token is
 * issued and returned so the browser can send the person straight to the
 * "choose a password" screen. That is safe: clicking the emailed link is
 * exactly the proof of mailbox ownership a reset requires.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const { token } = await parseJson(request, verifyTokenSchema);

  const result = await verifyEmail(token);
  if (!result.ok) throw new AppError(result.message, 400);

  if (!result.needsPassword) {
    return ok({ verified: true, email: result.email, next: '/login' });
  }

  const user = await prisma.user.findUnique({
    where: { email: result.email },
    select: { id: true },
  });
  if (!user) return ok({ verified: true, email: result.email, next: '/login' });

  const reset = await issuePasswordResetToken(user.id);
  return ok({
    verified: true,
    email: result.email,
    next: `/reset-password?token=${encodeURIComponent(reset.token)}&welcome=1`,
  });
});
