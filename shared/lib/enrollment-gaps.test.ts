import { describe, expect, it } from 'vitest';
import { placementQueue, type UnplacedEnrollment } from './enrollment-gaps';

const row = (enrollmentId: string, studentId: string, schoolYearId: string, approvedAt: string | null, semester = 1): UnplacedEnrollment => ({
  enrollmentId, studentId, schoolYearId, approvedAt, semester, yearLevel: 1, programId: '1',
});

describe('placementQueue', () => {
  it('orders by approval time, oldest first, then by enrollment id', () => {
    const q = placementQueue([
      row('30', 's3', 'y1', '2026-10-03T00:00:00Z'),
      row('10', 's1', 'y1', '2026-10-01T00:00:00Z'),
      row('25', 's2', 'y1', '2026-10-01T00:00:00Z'),
    ]);
    expect(q.map((r) => r.enrollmentId)).toEqual(['10', '25', '30']);
  });

  it('puts enrollments without an approval time last, by id', () => {
    const q = placementQueue([row('5', 's1', 'y1', null), row('9', 's2', 'y1', '2026-10-01T00:00:00Z'), row('4', 's3', 'y1', null)]);
    expect(q.map((r) => r.enrollmentId)).toEqual(['9', '4', '5']);
  });

  it('one placement per student per school year: both semesters enrolled need only one seat', () => {
    const q = placementQueue([row('7', 's1', 'y1', '2026-10-05T00:00:00Z', 2), row('3', 's1', 'y1', '2026-10-01T00:00:00Z', 1)]);
    expect(q).toHaveLength(1);
    expect(q[0]!.enrollmentId).toBe('3');
  });

  it('the same student in two school years needs a seat in each', () => {
    expect(placementQueue([row('1', 's1', 'y1', null), row('2', 's1', 'y2', null)])).toHaveLength(2);
  });

  it('is deterministic whatever order the rows arrive in', () => {
    const rows = [row('4', 'a', 'y', null), row('2', 'b', 'y', '2026-01-02T00:00:00Z'), row('3', 'c', 'y', '2026-01-01T00:00:00Z')];
    expect(placementQueue(rows)).toEqual(placementQueue([...rows].reverse()));
  });
});
