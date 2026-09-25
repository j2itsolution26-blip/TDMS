import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { AppError } from '@/lib/http';
import { createSuperAdminSchema } from '@/server/validation/schemas';
import { isBootstrapAllowed, createSuperAdmin } from '@/server/services/super-admin-service';

/**
 * POST /api/auth/super-admin - one-time bootstrap, public by necessity.
 *
 * It is safe to leave unauthenticated ONLY because isBootstrapAllowed() is
 * false the instant a Super Admin exists; this is the Node equivalent of
 * the EnsureSuperAdminNotBootstrapped middleware, re-checked inside the
 * transaction so it cannot be raced.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  if (!(await isBootstrapAllowed())) {
    throw new AppError(
      'Super Admin setup has already been completed. Please log in using the existing administrator account.',
      409,
    );
  }

  const input = await parseJson(request, createSuperAdminSchema);
  const created = await createSuperAdmin(
    { name: input.name, email: input.email, password: input.password },
    requestContext(request),
  );
  return ok({ id: created.id, redirectTo: '/login' }, 201);
});
