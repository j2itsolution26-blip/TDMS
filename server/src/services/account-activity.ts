import { prisma } from '@/server/lib/prisma';
import { actorLabel } from './audit-log';

/**
 * A person's own account history for My Profile → Activity, from the audit
 * log — real rows only, never made up.
 *
 * Only events ABOUT this account are shown: the row's target is the account
 * (`User <id>` for events recorded since this was added; the "Name <email>"
 * label or the bare email for older ones) AND the action is one of the account
 * events below. Matching on the target, never the actor, keeps an
 * administrator's actions on OTHER people's accounts out of their own history.
 */

/** What each recorded account event is called. Anything else is not shown. */
export const ACCOUNT_EVENTS: Record<string, { label: string; kind: 'signin' | 'profile' | 'security' }> = {
  LOGIN_SUCCESS: { label: 'Signed in', kind: 'signin' },
  ADMIN_LOGIN_SUCCESS: { label: 'Signed in with an access code', kind: 'signin' },
  PROFILE_UPDATED: { label: 'Profile information updated', kind: 'profile' },
  PASSWORD_CHANGED: { label: 'Password changed', kind: 'security' },
  TEMP_PASSWORD_CHANGED: { label: 'Temporary password replaced', kind: 'security' },
  ADMIN_TEMP_PASSWORD_CHANGED: { label: 'Temporary password replaced', kind: 'security' },
  ACCOUNT_PASSWORD_RESET_COMPLETED: { label: 'Password reset by email link', kind: 'security' },
  TEMP_PASSWORD_RESET: { label: 'Password reset by an administrator', kind: 'security' },
  STAFF_PASSWORD_RESET: { label: 'Password reset by an administrator', kind: 'security' },
  ACCOUNT_GOOGLE_LINKED: { label: 'Google account linked', kind: 'security' },
  ACCOUNT_ACTIVATED_VIA_GOOGLE: { label: 'Account activated with Google', kind: 'security' },
};

/** The audit target new account events are recorded under. */
export const accountTarget = (userId: bigint | string) => `User ${userId}`;

/** "Chrome on Windows" from a User-Agent header, or null — a summary of what was sent, nothing guessed. */
export function describeDevice(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : null;
  const os = /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}

export interface AccountEvent {
  id: string;
  action: string;
  label: string;
  kind: 'signin' | 'profile' | 'security';
  at: string;
  device: string | null;
  ip: string | null;
}

export async function accountActivity(user: { id: string | bigint; name: string; email: string }, limit = 20): Promise<AccountEvent[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: { in: Object.keys(ACCOUNT_EVENTS) },
      target: { in: [accountTarget(user.id), actorLabel(user), user.email] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, action: true, createdAt: true, userAgent: true, ipAddress: true },
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    action: r.action,
    label: ACCOUNT_EVENTS[r.action].label,
    kind: ACCOUNT_EVENTS[r.action].kind,
    at: r.createdAt.toISOString(),
    device: describeDevice(r.userAgent),
    ip: r.ipAddress,
  }));
}
