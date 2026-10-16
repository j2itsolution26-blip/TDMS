import { ok } from '@/server/lib/http';
import { withErrorHandling, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { applicationPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/schemas/schemas';
import { submitApplication } from '@/server/services/application-service';

type Params = { params: Promise<{ id: string }> };

/** Checked against the stored record: every required field and required document. */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(applicationPolicy.update(user));
  return ok(await submitApplication(user, idSchema.parse((await params).id), requestContext(request)));
});
