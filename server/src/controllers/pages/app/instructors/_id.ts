import { notFound } from '@/server/lib/page-signals';
import { requestHeaders } from '@/server/plugins/request-context';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { viewInstructorPds } from '@/server/services/teaching/pds';
import { orNotFound, queryId } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/**
 * An Instructor's Personal Data Sheet, read-only, for the Director and
 * Coordinator. Each view is audited, so the reader's address and browser are
 * recorded.
 */
export async function loadInstructorsId({ params }: PageRequest) {
  const user = await requireUser();
  authorizePage(teachingPolicy.viewInstructorProfiles(user));
  const id = queryId(params.id);
  if (!id) notFound();

  const h = requestHeaders();
  const forwarded = h['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ?? null;
  const userAgent = h['user-agent'] ?? null;

  const pds = await orNotFound(viewInstructorPds(user, id, { ip, userAgent }));
  return { pds };
}
