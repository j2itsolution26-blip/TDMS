import { describe, expect, it } from 'vitest';
import { SECTION_YEAR_LEVELS, sectionLabel, yearLevelLabel } from './teaching';
import { sectionSchema } from '../../server/src/schemas/teaching';

describe('year levels', () => {
  it('spells the ordinals correctly', () => {
    expect(SECTION_YEAR_LEVELS.map(yearLevelLabel)).toEqual(['1st Year', '2nd Year', '3rd Year']);
  });
});

describe('sectionLabel', () => {
  it('separates a code ending in a digit from the year', () => {
    expect(sectionLabel('DIT-1', 1, 'A')).toBe('DIT-1 · 1st Year · Section A');
    expect(sectionLabel('DIT-1', 2, 'A')).toBe('DIT-1 · 2nd Year · Section A');
    expect(sectionLabel('DIT-1', 3, 'B')).toBe('DIT-1 · 3rd Year · Section B');
    expect(sectionLabel('DIT-1', 1, 'A')).not.toContain('11st');
  });
  it('uses each program’s own code', () => {
    expect(sectionLabel('DHT', 2, 'C')).toBe('DHT · 2nd Year · Section C');
  });
});

describe('sectionSchema', () => {
  const base = { schoolYearId: '1', programId: '1', name: 'A' };
  it('accepts 1st to 3rd Year', () => {
    for (const y of [1, 2, 3]) expect(sectionSchema.safeParse({ ...base, yearLevel: y }).success).toBe(true);
  });
  it('refuses a 4th Year and anything outside 1–3', () => {
    for (const y of [0, 4, 5, 6, 1.5]) expect(sectionSchema.safeParse({ ...base, yearLevel: y }).success).toBe(false);
  });
});
