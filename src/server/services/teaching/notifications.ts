import 'server-only';
import { cache } from 'react';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { AuthUser } from '@/types/domain';
import { USER_MODEL_TYPE } from '@/server/auth/rbac';

/**
 * In-app notifications — the bell in the header and /notifications.
 *
 * TDMS had no notification system before this module (its mailer sends
 * sign-in and password mail only), so this is the one place a notification is
 * made. Each helper takes the transaction the triggering change runs in, so a
 * notification exists exactly when the thing it announces does.
 *
 * A notification is written for one user and only ever read back filtered by
 * that user's id: there is no path by which one person reads another's.
 */

type Db = Prisma.TransactionClient;

export interface NewNotification {
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
}

export async function notifyUsers(db: Db, userIds: bigint[], n: NewNotification): Promise<void> {
  const unique = [...new Set(userIds.map(String))].map(BigInt);
  if (unique.length === 0) return;
  await db.notification.createMany({
    data: unique.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body ?? null, href: n.href ?? null })),
  });
}

/** Students without a linked account have nowhere to be notified, and are skipped. */
export async function notifyStudents(db: Db, studentIds: bigint[], n: NewNotification): Promise<void> {
  if (studentIds.length === 0) return;
  const rows = await db.student.findMany({ where: { id: { in: studentIds }, userId: { not: null } }, select: { userId: true } });
  await notifyUsers(db, rows.map((r) => r.userId!), n);
}

/** Everyone active who holds one of these roles. */
export async function notifyRoles(db: Db, roles: string[], n: NewNotification, exceptUserId?: bigint): Promise<void> {
  const rows = await db.modelHasRole.findMany({
    where: { modelType: USER_MODEL_TYPE, role: { name: { in: roles }, guardName: 'web' } },
    select: { modelId: true },
  });
  const ids = rows.map((r) => r.modelId).filter((id) => id !== exceptUserId);
  if (ids.length === 0) return;
  // Only live accounts: a deactivated user's inbox is not somewhere anyone reads.
  const active = await db.user.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { id: true } });
  await notifyUsers(db, active.map((u) => u.id), n);
}

// --- Reading ---------------------------------------------------------------------

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

function view(n: { id: bigint; type: string; title: string; body: string | null; href: string | null; readAt: Date | null; createdAt: Date }): NotificationView {
  return {
    id: n.id.toString(),
    type: n.type,
    title: n.title,
    body: n.body,
    href: n.href,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}

/** The bell: unread count and the latest few. One round trip, deduped per request. */
export const getNotificationSummary = cache(async (user: AuthUser) => {
  const userId = BigInt(user.id);
  const [unread, latest] = await Promise.all([
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 6 }),
  ]);
  return { unread, latest: latest.map(view) };
});

export async function listNotifications(user: AuthUser, page: number, perPage = 20) {
  const userId = BigInt(user.id);
  const [total, rows] = await Promise.all([
    prisma.notification.count({ where: { userId } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * perPage, take: perPage }),
  ]);
  return { rows: rows.map(view), page, lastPage: Math.max(1, Math.ceil(total / perPage)), total };
}

export async function markNotificationsRead(user: AuthUser, ids: bigint[] | 'all'): Promise<number> {
  const userId = BigInt(user.id);
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids === 'all' ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
  return result.count;
}
