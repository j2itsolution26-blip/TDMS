import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@shared/types/domain';
import { studentAccountPolicy } from './policies';

const user = (roles: string[], permissions: string[] = []) => ({ id: '1', name: 'X', email: 'x@example.test', roles, permissions }) as unknown as AuthUser;

describe('studentAccountPolicy', () => {
  it('lets the Admin create student logins', () => {
    expect(studentAccountPolicy.create(user(['admin'], ['accounts.manage']))).toBe(true);
  });

  it('keeps out the Super Admin, even holding the permission', () => {
    expect(studentAccountPolicy.create(user(['super_admin'], ['accounts.manage']))).toBe(false);
  });

  it('keeps out the office roles and students', () => {
    for (const r of ['director', 'coordinator', 'secretary', 'processing_officer', 'teacher', 'student', 'assessment_center_manager']) {
      expect(studentAccountPolicy.create(user([r], ['students.manage', 'students.enroll']))).toBe(false);
      expect(studentAccountPolicy.viewAny(user([r]))).toBe(false);
    }
  });
});
