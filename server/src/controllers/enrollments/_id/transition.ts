import { ok } from '@/server/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { enrollmentPolicy } from '@/server/auth/policies';
import { enrollmentTransitionSchema, idSchema } from '@/server/schemas/schemas';
import { transitionEnrollment } from '@/server/services/enrollment-service';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const user = await requireApiUser();
  authorize(enrollmentPolicy.transition(user));
  const { id } = await params;
  const input = await parseJson(request, enrollmentTransitionSchema);
  const result = await transitionEnrollment(idSchema.parse(id), input.status, user, input.reason, requestContext(request));
  // On approval, the section the student was placed in.
  return ok({ status: input.status, placement: result.placement });
});
