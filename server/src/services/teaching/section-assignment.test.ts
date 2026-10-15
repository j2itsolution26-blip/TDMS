import { describe, expect, it } from 'vitest';
import { compareSectionNames, nextSectionName, pickSection } from './section-assignment';

const s = (name: string, count: number) => ({ name, count });

describe('nextSectionName', () => {
  it('starts at A', () => expect(nextSectionName([])).toBe('A'));
  it('takes the next letter', () => expect(nextSectionName(['A', 'B'])).toBe('C'));
  it('fills a gap before going on', () => expect(nextSectionName(['A', 'C'])).toBe('B'));
  it('goes past Z to AA, AB', () => {
    const az = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    expect(nextSectionName(az)).toBe('AA');
    expect(nextSectionName([...az, 'AA'])).toBe('AB');
  });
  it('ignores case and custom names', () => expect(nextSectionName(['a', 'Morning'])).toBe('B'));
});

describe('compareSectionNames', () => {
  it('orders A … Z, then AA, then other names', () => {
    expect(['AA', 'Morning', 'B', 'A', 'Z'].sort(compareSectionNames)).toEqual(['A', 'B', 'Z', 'AA', 'Morning']);
  });
});

describe('pickSection', () => {
  it('no sections: none (Section A will be created)', () => expect(pickSection([])).toBeNull());
  it('students 1–25 go to A', () => expect(pickSection([s('A', 24)])?.name).toBe('A'));
  it('student 26 goes to B once A is full', () => expect(pickSection([s('A', 25), s('B', 0)])?.name).toBe('B'));
  it('student 51 goes to C', () => expect(pickSection([s('A', 25), s('B', 25), s('C', 0)])?.name).toBe('C'));
  it('A 24 and B 10: the next student fills A first', () => expect(pickSection([s('B', 10), s('A', 24)])?.name).toBe('A'));
  it('A, B full and C 12: C, and no D yet', () => expect(pickSection([s('A', 25), s('B', 25), s('C', 12)])?.name).toBe('C'));
  it('all full: none (the next section will be created)', () => expect(pickSection([s('A', 25), s('B', 25)])).toBeNull());
  it('an over-full section is skipped, never added to', () => expect(pickSection([s('A', 27), s('B', 3)])?.name).toBe('B'));
});
