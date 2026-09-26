import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { userPolicy } from '@/server/auth/policies';
import { inviteAccountSchema } from '@/server/validation/schemas';
import { listAccounts, inviteAccount } from '@/server/services/account-service';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(userPolicy.viewAny(user));
  const page = Number(request.nextUrl.searchParams.get('page') ?? 1);
  return ok(await listAccounts(Number.isFinite(page) && page > 0 ? page : 1));
});

/**
 * Invite a member of staff. No password is generated: the account is created
 * PENDING_VERIFICATION and the invitee sets their own through the emailed
 * verification link.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(userPolicy.create(user));
  const input = await parseJson(request, inviteAccountSchema);
  return ok(await inviteAccount(user, input, requestContext(request)), 201);
});
