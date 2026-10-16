import { ok, AppError } from '@/server/lib/http';
import { withErrorHandling, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { applicationPolicy } from '@/server/auth/policies';
import { approveApplicationSchema, idSchema } from '@/server/schemas/schemas';
import { approveApplication } from '@/server/services/application-service';

type Params = { params: Promise<{ id: string }> };

/** Body optional: { studentId } links an existing student, { createNew: true } confirms a new one. */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(applicationPolicy.review(user));
  const id = idSchema.parse((await params).id);
  const text = await request.text();
  let body: unknown = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new AppError('The request body is not valid JSON.', 400);
    }
  }
  return ok(await approveApplication(user, id, approveApplicationSchema.parse(body), requestContext(request)));
});
