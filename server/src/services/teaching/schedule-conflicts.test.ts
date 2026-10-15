import { describe, expect, it } from 'vitest';
import { findConflicts, overlaps, type BookedMeeting, type Meeting } from './schedule-conflicts';

const m = (dayOfWeek: number, startTime: string, endTime: string, roomId: bigint | null = null): Meeting => ({ dayOfWeek, startTime, endTime, roomId });
const booked = (meeting: Meeting, extra: Partial<BookedMeeting> = {}): BookedMeeting => ({
  ...meeting, classId: 99n, sectionId: 50n, instructorId: 7n, label: 'COMP-1 · DIT-1 · 1st Year · Section A', roomCode: 'LAB-1', ...extra,
});

describe('overlaps', () => {
  it('consecutive classes do not overlap', () => expect(overlaps(m(1, '08:00', '10:00'), m(1, '10:00', '12:00'))).toBe(false));
  it('a partial overlap does', () => expect(overlaps(m(1, '08:00', '10:00'), m(1, '09:30', '11:00'))).toBe(true));
  it('one inside another does', () => expect(overlaps(m(1, '08:00', '12:00'), m(1, '09:00', '10:00'))).toBe(true));
  it('identical times do', () => expect(overlaps(m(1, '08:00', '10:00'), m(1, '08:00', '10:00'))).toBe(true));
  it('different days never do', () => expect(overlaps(m(1, '08:00', '10:00'), m(2, '08:00', '10:00'))).toBe(false));
  it('a one-minute overlap does', () => expect(overlaps(m(3, '13:00', '14:01'), m(3, '14:00', '15:00'))).toBe(true));
});

describe('findConflicts', () => {
  const base = { sectionId: 1n, instructorId: 2n, instructorName: 'Ivan', meetings: [m(1, '08:00', '10:00', 10n)] };

  it('nothing booked: no conflicts', () => expect(findConflicts(base, [])).toEqual([]));
  it('the same room at the same time is a room conflict', () => {
    const c = findConflicts(base, [booked(m(1, '09:00', '11:00', 10n))]);
    expect(c.map((x) => x.kind)).toEqual(['room']);
    expect(c[0]!.message).toBe('Room LAB-1 is already booked Monday 9:00 AM–11:00 AM by COMP-1 · DIT-1 · 1st Year · Section A.');
  });
  it('another room at the same time is fine', () => expect(findConflicts(base, [booked(m(1, '08:00', '10:00', 11n))])).toEqual([]));
  it('the same instructor at the same time is an instructor conflict, in any room', () => {
    expect(findConflicts(base, [booked(m(1, '08:30', '09:00', 11n), { instructorId: 2n })]).map((x) => x.kind)).toEqual(['instructor']);
  });
  it('the same section at the same time is a section conflict', () => {
    expect(findConflicts(base, [booked(m(1, '09:00', '09:30', 11n), { sectionId: 1n })]).map((x) => x.kind)).toEqual(['section']);
  });
  it('one booking can clash on room, instructor and section at once', () => {
    expect(findConflicts(base, [booked(m(1, '08:00', '10:00', 10n), { instructorId: 2n, sectionId: 1n })]).map((x) => x.kind)).toEqual(['room', 'instructor', 'section']);
  });
  it('a class without an instructor or room clashes only on its section', () => {
    const c = findConflicts({ sectionId: 1n, instructorId: null, meetings: [m(1, '08:00', '10:00')] }, [booked(m(1, '08:00', '10:00', 10n), { instructorId: null, sectionId: 1n })]);
    expect(c.map((x) => x.kind)).toEqual(['section']);
  });
  it('a class whose own meetings overlap is refused', () => {
    const c = findConflicts({ ...base, meetings: [m(2, '08:00', '10:00'), m(2, '09:00', '11:00')] }, []);
    expect(c.map((x) => [x.kind, x.meeting])).toEqual([['self', 1]]);
  });
  it('consecutive meetings back to back in one room are allowed', () => {
    expect(findConflicts({ ...base, meetings: [m(1, '10:00', '12:00', 10n)] }, [booked(m(1, '08:00', '10:00', 10n), { instructorId: 2n, sectionId: 1n })])).toEqual([]);
  });
});
