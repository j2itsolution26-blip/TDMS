import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { applicationPolicy } from '@/server/auth/policies';
import { applicationSchema } from '@/server/schemas/schemas';
import { listApplications, createApplication } from '@/server/services/application-service';

const optionalId = (v: string | null) => (v && /^\d+$/.test(v) ? BigInt(v) : undefined);

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(applicationPolicy.viewAny(user));
  const sp = new URL(request.url).searchParams;
  const page = Number(sp.get('page') ?? 1);
  return ok(
    await listApplications({
      page: Number.isFinite(page) && page > 0 ? page : 1,
      status: sp.get('status') ?? undefined,
      search: sp.get('search') ?? undefined,
      programId: optionalId(sp.get('program')),
      schoolYearId: optionalId(sp.get('year')),
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
    }),
  );
});

/** Records a draft. Submitting is POST /applications/:id/submit, after any uploads. */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(applicationPolicy.create(user));
  const input = await parseJson(request, applicationSchema);
  return ok(await createApplication(user, input, requestContext(request)), 201);
});
