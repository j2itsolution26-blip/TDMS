import { requireUser } from '@/server/auth/current-user';
import { listNotifications } from '@/server/services/teaching/notifications';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Every notification the signed-in user has received — only theirs. */

export async function loadNotifications({ query }: PageRequest) {
  const user = await requireUser();
  const { page } = query;
  const n = Math.max(1, Number(page) || 1);
  const data = await listNotifications(user, n);
  const unread = data.rows.some((r) => !r.read);

  return { data, page, unread };
}
