import { describe, expect, it } from 'vitest';
import { enrollmentShare } from './enrollment-share';

describe('enrollmentShare', () => {
  it('a share of the enrolled total, to one decimal at most', () => {
    expect(enrollmentShare(3, 8)).toBe('37.5%');
    expect(enrollmentShare(2, 5)).toBe('40%');
    expect(enrollmentShare(1, 3)).toBe('33.3%');
    expect(enrollmentShare(5, 5)).toBe('100%');
  });
  it('nobody enrolled: 0%, never NaN', () => {
    expect(enrollmentShare(0, 0)).toBe('0%');
    expect(enrollmentShare(0, 12)).toBe('0%');
  });
});
