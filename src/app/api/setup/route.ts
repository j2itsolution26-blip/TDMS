import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { initialSetupSchema } from '@/server/validation/schemas';
import { completeInitialSetup } from '@/server/services/setup-service';

/**
 * POST /api/setup — create the first Super Admin of a new installation.
 *
 * Every guard is in the service, not here and not in the page: it refuses
 * once the system is initialized and when another setup wins the race.
 * No session is issued; the new administrator signs in at /login with
 * the password they just chose.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const input = await parseJson(request, initialSetupSchema);

  const created = await completeInitialSetup(
    { name: input.name, email: input.email, password: input.password },
    requestContext(request),
  );

  return ok({ email: created.email, redirectTo: '/login?setup=complete' }, 201);
});

