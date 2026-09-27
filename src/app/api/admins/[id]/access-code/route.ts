import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { adminAccountPolicy } from '@/server/auth/policies';
import { generateAccessCodeSchema, idSchema } from '@/server/validation/schemas';
import { generateAdminAccessCode } from '@/server/services/admin-account-service';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admins/:id/access-code — issue a one-time access code.
 *
 * Any previous unused code for that administrator is cancelled by the same
 * call, so "one code, one sign-in" stays true and a code read out last week
 * stops working the moment a new one is issued.
 *
 * The plaintext code is in this response and nowhere else durable.
 */
export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  const { id } = await params;
  const targetId = idSchema.parse(id);

  /*
   * The policy is checked on the id before the service loads anything, and
   * the service then refuses any account that is not an ordinary Admin. Two
   * checks, because this one issues a credential: the policy says who may
   * act, the service says what may be acted on.
   */
  authorize(adminAccountPolicy.generateAccessCode(user, { id: targetId.toString(), roles: [] }));

  const input = await parseJson(request, generateAccessCodeSchema);

  return ok(
    await generateAdminAccessCode(
      user,
      targetId,
      { securityCode: input.securityCode, emailAccessCode: input.emailAccessCode },
      requestContext(request),
    ),
  );
});
