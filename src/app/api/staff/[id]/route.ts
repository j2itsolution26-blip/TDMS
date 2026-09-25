import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { userPolicy } from '@/server/auth/policies';
import { staffSchema, idSchema } from '@/server/validation/schemas';
import { getStaffMember, updateStaff } from '@/server/services/staff-service';

type Params = { params: Promise<{ id: string }> };

export const PUT = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  const { id } = await params;
  const targetId = idSchema.parse(id);
  const target = await getStaffMember(targetId);
  authorize(userPolicy.update(user, { id: target.id.toString(), roles: target.roles }));
  const input = await parseJson(request, staffSchema);
  await updateStaff(user, targetId, input, requestContext(request));
  return ok({ updated: true });
});
