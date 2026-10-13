import { describe, expect, it } from 'vitest';
import { SECTION_CAPACITY, sectionCapacity } from './teaching';

describe('sectionCapacity', () => {
  it('is 25 per section', () => {
    expect(SECTION_CAPACITY).toBe(25);
  });

  it('counts available slots', () => {
    expect(sectionCapacity(0)).toMatchObject({ count: 0, capacity: 25, available: 25, level: 'open', over: false });
    expect(sectionCapacity(18)).toMatchObject({ available: 7, level: 'open' });
    expect(sectionCapacity(24)).toMatchObject({ available: 1, level: 'near' });
  });

  it('is nearly full from 20, full at 25', () => {
    expect(sectionCapacity(19).level).toBe('open');
    expect(sectionCapacity(20).level).toBe('near');
    expect(sectionCapacity(25)).toMatchObject({ available: 0, level: 'full', over: false });
  });

  it('never reports negative slots for a section already over the limit', () => {
    expect(sectionCapacity(27)).toMatchObject({ available: 0, level: 'full', over: true });
  });
});
