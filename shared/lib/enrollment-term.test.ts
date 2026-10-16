import { describe, expect, it } from 'vitest';
import { ENROLLMENT_SEMESTERS, termTaken, validYearLevels } from './enrollment-term';

describe('ENROLLMENT_SEMESTERS', () => {
  it('a term enrollment is for the 1st or 2nd semester', () => {
    expect([...ENROLLMENT_SEMESTERS]).toEqual([1, 2]);
  });
});

describe('validYearLevels', () => {
  it('without a known final year, every TDMS year level', () => {
    expect(validYearLevels(null)).toEqual([1, 2, 3]);
  });
  it('up to the curriculum’s final year when it has one', () => {
    expect(validYearLevels(2)).toEqual([1, 2]);
    expect(validYearLevels(3)).toEqual([1, 2, 3]);
  });
  it('never beyond the TDMS maximum, never below the first year', () => {
    expect(validYearLevels(5)).toEqual([1, 2, 3]);
    expect(validYearLevels(0)).toEqual([1, 2, 3]);
  });
});

describe('termTaken', () => {
  const existing = [{ schoolYear: '2026-2027', semester: 1 }, { schoolYear: '2025-2026', semester: 2 }];
  it('finds a term the student already has', () => {
    expect(termTaken(existing, '2026-2027', 1)).toBe(true);
    expect(termTaken(existing, '2025-2026', 2)).toBe(true);
  });
  it('a different semester or school year is free', () => {
    expect(termTaken(existing, '2026-2027', 2)).toBe(false);
    expect(termTaken(existing, '2027-2028', 1)).toBe(false);
  });
});
