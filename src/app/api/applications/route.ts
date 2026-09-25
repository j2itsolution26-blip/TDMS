import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { applicationPolicy } from '@/server/auth/policies';
import { applicationSchema } from '@/server/validation/schemas';
import { listApplications, createApplication } from '@/server/services/application-service';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(applicationPolicy.viewAny(user));
  const sp = request.nextUrl.searchParams;
  const page = Number(sp.get('page') ?? 1);
  return ok(
    await listApplications({
      page: Number.isFinite(page) && page > 0 ? page : 1,
      status: sp.get('status') ?? undefined,
    }),
  );
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireApiUser();
  authorize(applicationPolicy.create(user));
  const input = await parseJson(request, applicationSchema);
  return ok(await createApplication(input), 201);
});
