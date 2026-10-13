import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@shared/types/domain';
import { ENROLLMENT_STATUSES, ENROLLMENT_STATUS_LABELS, ENROLLMENT_TRANSITIONS } from '@shared/types/domain';
import { enrollmentPolicy } from './policies';

const user = (roles: string[], permissions: string[] = []) => ({ id: '1', name: 'X', email: 'x@example.test', roles, permissions }) as unknown as AuthUser;

describe('enrollment workflow', () => {
  it('has Rejected as its own status, labelled', () => {
    expect(ENROLLMENT_STATUSES).toContain('rejected');
    expect(ENROLLMENT_STATUS_LABELS.rejected).toBe('Rejected');
  });

  it('lets a pending enrollment be approved or rejected, and an enrolled one dropped', () => {
    expect(ENROLLMENT_TRANSITIONS.pending).toEqual(['enrolled', 'rejected']);
    expect(ENROLLMENT_TRANSITIONS.enrolled).toEqual(['dropped']);
  });

  it('makes rejected and dropped final, and never goes back to pending', () => {
    expect(ENROLLMENT_TRANSITIONS.rejected).toEqual([]);
    expect(ENROLLMENT_TRANSITIONS.dropped).toEqual([]);
    for (const s of ENROLLMENT_STATUSES) expect(ENROLLMENT_TRANSITIONS[s]).not.toContain('pending');
  });

  it('lets the Secretary decide, and not the Director, Coordinator, Instructor, Student or Super Admin', () => {
    expect(enrollmentPolicy.transition(user(['secretary'], ['students.enroll']))).toBe(true);
    for (const r of ['director', 'coordinator', 'teacher', 'student', 'assessment_center_manager']) {
      expect(enrollmentPolicy.transition(user([r]))).toBe(false);
    }
    expect(enrollmentPolicy.transition(user(['super_admin'], ['students.enroll']))).toBe(false);
  });
});
