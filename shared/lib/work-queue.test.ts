import { describe, expect, it } from 'vitest';
import { OVERDUE_DAYS, daysWaiting, queueTabs, waitingLabel } from './work-queue';

const now = new Date('2026-10-16T10:00:00Z');

describe('daysWaiting', () => {
  it('counts whole days since the oldest item', () => {
    expect(daysWaiting('2026-10-16T08:00:00Z', now)).toBe(0);
    expect(daysWaiting('2026-10-15T09:00:00Z', now)).toBe(1);
    expect(daysWaiting('2026-10-07T10:00:00Z', now)).toBe(9);
  });
  it('is null when nothing is waiting or the date is unreadable', () => {
    expect(daysWaiting(null, now)).toBeNull();
    expect(daysWaiting(undefined, now)).toBeNull();
    expect(daysWaiting('not a date', now)).toBeNull();
  });
  it('never goes negative for a clock slightly ahead', () => {
    expect(daysWaiting('2026-10-16T10:05:00Z', now)).toBe(0);
  });
});

describe('waitingLabel', () => {
  it('says how long the oldest item has waited', () => {
    expect(waitingLabel(0)).toBe('Oldest from today');
    expect(waitingLabel(1)).toBe('Oldest waiting 1 day');
    expect(waitingLabel(9)).toBe('Oldest waiting 9 days');
  });
  it('a week or more is overdue', () => {
    expect(OVERDUE_DAYS).toBe(7);
  });
});

describe('queueTabs', () => {
  const item = (key: string, group: 'applications' | 'enrollment' | 'documents' | 'records', count: number) => ({ key, group, count });

  it('starts with All, then each group present, in a fixed order, with summed counts', () => {
    const tabs = queueTabs([item('docs', 'documents', 2), item('apps', 'applications', 3), item('incomplete', 'records', 1), item('enroll', 'enrollment', 0)]);
    expect(tabs).toEqual([
      { key: 'all', label: 'All', count: 6 },
      { key: 'applications', label: 'Applications', count: 3 },
      { key: 'enrollment', label: 'Enrollment', count: 0 },
      { key: 'documents', label: 'Documents', count: 2 },
      { key: 'records', label: 'Records', count: 1 },
    ]);
  });
  it('leaves out a group the viewer has no rows for', () => {
    expect(queueTabs([item('enroll', 'enrollment', 4)]).map((t) => t.key)).toEqual(['all', 'enrollment']);
  });
  it('an empty queue still has its All tab', () => {
    expect(queueTabs([])).toEqual([{ key: 'all', label: 'All', count: 0 }]);
  });
});
