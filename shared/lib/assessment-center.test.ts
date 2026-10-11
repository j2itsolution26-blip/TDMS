import { describe, expect, it } from 'vitest';
import { batchTotals, combineTotals, findConflicts, officialResult, type ScheduleSlot } from './assessment-center';

const row = (studentId: string, status: string, result: string | null, attempt = 1) => ({ studentId, attempt, status, result });

describe('officialResult', () => {
  it('reports C / NYC only once finalized', () => {
    expect(officialResult({ status: 'FINALIZED', result: 'C' })).toBe('C');
    expect(officialResult({ status: 'FINALIZED', result: 'NYC' })).toBe('NYC');
    expect(officialResult({ status: 'DRAFT', result: 'C' })).toBe('PENDING');
    expect(officialResult({ status: 'PENDING', result: null })).toBe('PENDING');
    expect(officialResult({ status: 'CANCELLED', result: 'C' })).toBeNull();
  });
});

describe('batchTotals', () => {
  it('counts finalized results only, with pending shown apart', () => {
    const t = batchTotals([row('1', 'FINALIZED', 'C'), row('2', 'FINALIZED', 'C'), row('3', 'FINALIZED', 'NYC'), row('4', 'DRAFT', 'C'), row('5', 'PENDING', null)]);
    expect(t).toEqual({ assessed: 3, competent: 2, notYetCompetent: 1, pending: 2, competentRate: 66.7 });
  });

  it('ignores cancelled rows entirely', () => {
    expect(batchTotals([row('1', 'CANCELLED', 'C'), row('2', 'FINALIZED', 'NYC')])).toEqual({ assessed: 1, competent: 0, notYetCompetent: 1, pending: 0, competentRate: 0 });
  });

  it('has no rate when nothing is finalized', () => {
    expect(batchTotals([row('1', 'DRAFT', 'C')]).competentRate).toBeNull();
    expect(batchTotals([]).competentRate).toBeNull();
  });

  it('counts a candidate once, by their latest attempt in the batch', () => {
    const t = batchTotals([row('1', 'FINALIZED', 'NYC', 1), row('1', 'FINALIZED', 'C', 2)]);
    expect(t).toMatchObject({ assessed: 1, competent: 1, notYetCompetent: 0 });
  });
});

describe('combineTotals', () => {
  it('adds batches and recomputes the rate from the sums', () => {
    const a = batchTotals([row('1', 'FINALIZED', 'C')]);
    const b = batchTotals([row('2', 'FINALIZED', 'NYC'), row('3', 'FINALIZED', 'NYC'), row('4', 'PENDING', null)]);
    expect(combineTotals([a, b])).toEqual({ assessed: 3, competent: 1, notYetCompetent: 2, pending: 1, competentRate: 33.3 });
    expect(combineTotals([]).competentRate).toBeNull();
  });
});

describe('findConflicts', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 14, h));
  const base: ScheduleSlot = { startsAt: at(8), endsAt: at(12), venue: 'Lab 1', assignedUserId: '7', assignedName: 'A. Reyes', batchId: '3', status: 'SCHEDULED' };
  const other = (over: Partial<ScheduleSlot>) => ({ ...base, id: 'x', venue: null, assignedUserId: null, assignedName: null, batchId: null, ...over });

  it('flags the same venue, assessor or batch at overlapping times', () => {
    expect(findConflicts(base, [other({ venue: ' lab 1 ' })])).toEqual([{ id: 'x', reasons: ['venue'] }]);
    expect(findConflicts(base, [other({ assignedUserId: '7' })])).toEqual([{ id: 'x', reasons: ['assignee'] }]);
    expect(findConflicts(base, [other({ batchId: '3' })])).toEqual([{ id: 'x', reasons: ['batch'] }]);
  });

  it('matches typed-in assessor names when neither is an account', () => {
    const slot = { ...base, assignedUserId: null };
    expect(findConflicts(slot, [other({ assignedName: 'a. reyes' })])[0]?.reasons).toEqual(['assignee']);
  });

  it('does not flag back-to-back activities, other resources, or cancelled ones', () => {
    expect(findConflicts(base, [other({ venue: 'Lab 1', startsAt: at(12), endsAt: at(14) })])).toEqual([]);
    expect(findConflicts(base, [other({ venue: 'Lab 2', assignedUserId: '8', batchId: '4' })])).toEqual([]);
    expect(findConflicts(base, [other({ venue: 'Lab 1', status: 'CANCELLED' })])).toEqual([]);
    expect(findConflicts({ ...base, status: 'CANCELLED' }, [other({ venue: 'Lab 1' })])).toEqual([]);
  });

  it('skips the activity itself when editing', () => {
    expect(findConflicts({ ...base, id: 'x' }, [other({ venue: 'Lab 1' })])).toEqual([]);
  });
});
