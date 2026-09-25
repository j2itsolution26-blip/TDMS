import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http';
import { withErrorHandling, parseJson, requestContext } from '@/server/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { userPolicy } from '@/server/auth/policies';
import { idSchema } from '@/server/validation/schemas';
import { getStaffMember, toggleStaffActive } from '@/server/services/staff-service';

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const user = await requireApiUser();
  const { id } = await params;
  const targetId = idSchema.parse(id);
  const target = await getStaffMember(targetId);
  authorize(userPolicy.toggleActive(user, { id: target.id.toString(), roles: target.roles }));
  const isActive = await toggleStaffActive(user, targetId, requestContext(request));
  return ok({ isActive });
});
