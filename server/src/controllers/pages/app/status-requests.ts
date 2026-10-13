import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { listStatusRequests } from '@/server/services/teaching/student-support';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Status Requests — the Director, Coordinator and Secretary confirm or reject Instructor recommendations. */

export async function loadStatusRequests(_request: PageRequest) {
  const user = await requireUser();
  authorizePage(teachingPolicy.viewStatusRequests(user));
  const rows = await listStatusRequests(user, {});

  return { rows, user };
}
