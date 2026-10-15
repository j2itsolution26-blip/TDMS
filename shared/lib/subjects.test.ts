import { describe, expect, it } from 'vitest';
import { hourFields, needsLaboratory, normaliseHours, totalHours } from './subjects';

describe('hourFields', () => {
  it('a lecture subject has lecture hours only', () => expect(hourFields('lecture')).toEqual({ lecture: true, lab: false }));
  it('a laboratory subject has laboratory hours only', () => expect(hourFields('laboratory')).toEqual({ lecture: false, lab: true }));
  it('a lecture-and-laboratory subject has both', () => expect(hourFields('lecture_laboratory')).toEqual({ lecture: true, lab: true }));
  it('practical, capstone and OJT may record either', () => {
    for (const t of ['practical', 'capstone', 'ojt']) expect(hourFields(t)).toEqual({ lecture: true, lab: true });
  });
});

describe('normaliseHours', () => {
  it('drops laboratory hours from a lecture subject', () => expect(normaliseHours({ subjectType: 'lecture', lectureHours: 3, labHours: 2 })).toMatchObject({ lectureHours: 3, labHours: null }));
  it('drops lecture hours from a laboratory subject', () => expect(normaliseHours({ subjectType: 'laboratory', lectureHours: 3, labHours: 2 })).toMatchObject({ lectureHours: null, labHours: 2 }));
  it('keeps both for lecture and laboratory', () => expect(normaliseHours({ subjectType: 'lecture_laboratory', lectureHours: 2, labHours: 3 })).toMatchObject({ lectureHours: 2, labHours: 3 }));
  it('missing hours stay empty', () => expect(normaliseHours({ subjectType: 'lecture_laboratory' })).toMatchObject({ lectureHours: null, labHours: null }));
});

describe('totalHours', () => {
  it('sums what is recorded', () => expect(totalHours({ lectureHours: 2, labHours: 3 })).toBe(5));
  it('one kind alone is the total', () => expect(totalHours({ lectureHours: 3, labHours: null })).toBe(3));
  it('nothing recorded is no total, not zero', () => expect(totalHours({ lectureHours: null, labHours: null })).toBeNull());
});

describe('needsLaboratory', () => {
  it('only a laboratory subject requires a laboratory room', () => {
    expect(needsLaboratory('laboratory')).toBe(true);
    expect(needsLaboratory('lecture_laboratory')).toBe(false);
    expect(needsLaboratory('lecture')).toBe(false);
  });
});
