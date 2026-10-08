import { notFound } from '@/server/lib/page-signals';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { sessionView } from '@/server/services/teaching/attendance';
import { orNotFound, queryId } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** The scanning screen for one attendance session. */

export async function loadTeachingAttendanceId({ params }: PageRequest) {
  const user = await requireUser();
  authorizePage(teachingPolicy.teach(user));
  const id = queryId((params).id);
  if (!id) notFound();
  const data = await orNotFound(sessionView(user, id));

  return { data };
}
