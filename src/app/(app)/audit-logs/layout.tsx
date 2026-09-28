import type { ReactNode } from 'react';
import { requireUser, authorizePage } from '@/server/auth/current-user';
import { systemPolicy } from '@/server/auth/policies';

/**
 * The permission check for Audit Logs, in the layout on purpose.
 *
 * A segment's error.tsx catches errors thrown by its page but NOT by its
 * layout. Authorising here means a refusal passes over audit-logs/error.tsx
 * ("Unable to load audit logs", meant for data failures) and reaches the
 * signed-in area's boundary, which says "This action is unauthorized" — the
 * same response a non-Super Admin got before this page was redesigned.
 */
export default async function AuditLogsLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  authorizePage(systemPolicy.viewAuditLogs(user));
  return children;
}
