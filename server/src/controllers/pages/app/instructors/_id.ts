import { notFound } from '@/server/lib/page-signals';
import { requestHeaders } from '@/server/plugins/request-context';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { staffPdsPolicy } from '@/server/auth/policies';
import { viewStaffPds } from '@/server/services/teaching/pds';
import { orNotFound, queryId } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/**
 * A staff member's Personal Data Sheet, read-only, for the Director (any)
 * and the Admin (the Secretary's). Each view is audited, so the reader's address and browser are
 * recorded.
 */
export async function loadInstructorsId({ params }: PageRequest) {
  const user = await requireUser();
  authorizePage(staffPdsPolicy.viewAny(user));
  const id = queryId(params.id);
  if (!id) notFound();

  const h = requestHeaders();
  const forwarded = h['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ?? null;
  const userAgent = h['user-agent'] ?? null;

  const pds = await orNotFound(viewStaffPds(user, id, { ip, userAgent }));
  return { pds };
}
