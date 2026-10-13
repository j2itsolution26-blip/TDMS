import { authorizePage, requireUser } from '@/server/auth/current-user';
import { announcementPolicy, suppliesPolicy } from '@/server/auth/policies';
import { supplyFilterSchema } from '@/server/schemas/supplies';
import { listInventory, listPurchases } from '@/server/services/supplies';
import { announcementsFor } from '@/server/services/announcements';
import { prisma } from '@/server/lib/prisma';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Assessment Center supplies, and announcements. Each checks its own policy here. */

const filters = (query: Record<string, string | undefined>) => {
  const parsed = supplyFilterSchema.safeParse(query);
  return parsed.success ? parsed.data : {};
};

/** /assessment/inventory */
export async function loadInventory({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(suppliesPolicy.view(user));
  const f = filters(query);
  return { ...(await listInventory(f.category)), category: f.category ?? null, canManage: suppliesPolicy.manage(user) };
}

/** /assessment/purchases */
export async function loadPurchases({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(suppliesPolicy.view(user));
  const f = filters(query);
  return { ...(await listPurchases(f)), category: f.category ?? null, status: f.status ?? null, canManage: suppliesPolicy.manage(user) };
}

/** /announcements — what is addressed to you; for the Director, every announcement and the compose form. */
export async function loadAnnouncements(_request: PageRequest) {
  const user = await requireUser();
  const canManage = announcementPolicy.manage(user);
  const [announcements, programs] = await Promise.all([
    announcementsFor(user, 100),
    canManage ? prisma.program.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }) : Promise.resolve([]),
  ]);
  return { announcements, canManage, programs: programs.map((p) => ({ id: p.id.toString(), code: p.code, name: p.name })) };
}
