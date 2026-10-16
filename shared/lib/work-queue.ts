/**
 * The office work queue's small rules, shared by the server that counts the
 * work and the dashboard that draws it.
 *
 * Age is measured from the OLDEST item still waiting in a stream — the
 * earliest submission of an application under decision, the earliest pending
 * enrollment — which is what tells the office something is being left behind.
 */

export type QueueGroup = 'applications' | 'enrollment' | 'documents' | 'records';

/** A stream whose oldest item has waited this many days reads as overdue. */
export const OVERDUE_DAYS = 7;

const DAY = 86_400_000;

/** Whole days since `oldest`; null when nothing is waiting. */
export function daysWaiting(oldest: string | null | undefined, now = new Date()): number | null {
  if (!oldest) return null;
  const then = new Date(oldest).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / DAY));
}

export function waitingLabel(days: number): string {
  if (days === 0) return 'Oldest from today';
  return `Oldest waiting ${days} ${days === 1 ? 'day' : 'days'}`;
}

const GROUPS: { key: QueueGroup; label: string }[] = [
  { key: 'applications', label: 'Applications' },
  { key: 'enrollment', label: 'Enrollment' },
  { key: 'documents', label: 'Documents' },
  { key: 'records', label: 'Records' },
];

/** The queue's tabs: All, then each group the viewer has rows in. */
export function queueTabs(items: { group: QueueGroup; count: number }[]): { key: 'all' | QueueGroup; label: string; count: number }[] {
  const total = items.reduce((n, i) => n + i.count, 0);
  return [
    { key: 'all', label: 'All', count: total },
    ...GROUPS.filter((g) => items.some((i) => i.group === g.key)).map((g) => ({
      key: g.key,
      label: g.label,
      count: items.filter((i) => i.group === g.key).reduce((n, i) => n + i.count, 0),
    })),
  ];
}
