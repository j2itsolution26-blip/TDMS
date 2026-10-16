import { describe, it, expect } from 'vitest';
import { DECISION_CONSEQUENCES, decisionSummary } from './enrollment-decision';

const row = { student: { name: 'Ana Cruz', studentNumber: '2026-0001' }, schoolYear: '2026-2027', semester: 1, section: null as string | null };

describe('decisionSummary', () => {
  it('shows the actual student, number and term', () => {
    expect(decisionSummary(row, 'approve')).toEqual([
      ['Student', 'Ana Cruz'],
      ['Student number', '2026-0001'],
      ['School year', 'SY 2026-2027'],
      ['Semester', 'Semester 1'],
      ['Section', 'Assigned automatically on approval'],
    ]);
  });

  it('shows the section when there is one', () => {
    expect(decisionSummary({ ...row, section: 'DIT 1 Section A' }, 'reject').at(-1)).toEqual(['Section', 'DIT 1 Section A']);
  });

  it('does not promise a placement when rejecting', () => {
    expect(decisionSummary(row, 'reject').at(-1)).toEqual(['Section', 'Not assigned']);
  });
});

describe('DECISION_CONSEQUENCES', () => {
  it('says an approval is final and changes the status', () => {
    expect(DECISION_CONSEQUENCES.approve.join(' ')).toMatch(/Enrolled/);
    expect(DECISION_CONSEQUENCES.approve.join(' ')).toMatch(/cannot be undone/);
  });

  it('says a rejection is final', () => {
    expect(DECISION_CONSEQUENCES.reject.join(' ')).toMatch(/Rejected/);
    expect(DECISION_CONSEQUENCES.reject.join(' ')).toMatch(/final/);
  });
});
