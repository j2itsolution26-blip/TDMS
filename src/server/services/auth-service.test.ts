import { describe, it, expect } from 'vitest';
import { resolveIdentifier } from './auth-service';
import { defaultSchoolYear } from './enrollment-service';
import { greeting } from './dashboard-service';
import { assignableRoles, STAFF_ROLES } from './account-service';
import { fullName } from './student-service';
import type { AuthUser } from '@/types/domain';

/** Pure logic ported from Laravel — no database involved. */

describe('resolveIdentifier', () => {
  it('routes anything containing @ to the email column', () => {
    expect(resolveIdentifier('a@b.test')).toEqual({ column: 'email', value: 'a@b.test' });
  });

  it('routes anything else to the username column', () => {
    expect(resolveIdentifier('director')).toEqual({ column: 'username', value: 'director' });
  });

  it('trims and lower-cases both forms', () => {
    expect(resolveIdentifier('  Director  ')).toEqual({ column: 'username', value: 'director' });
    expect(resolveIdentifier(' A@B.TEST ')).toEqual({ column: 'email', value: 'a@b.test' });
  });
});

describe('defaultSchoolYear', () => {
  it('rolls over in June, as the Volt mount() did', () => {
    expect(defaultSchoolYear(new Date('2026-06-01T00:00:00'))).toBe('2026-2027');
    expect(defaultSchoolYear(new Date('2026-12-31T00:00:00'))).toBe('2026-2027');
    expect(defaultSchoolYear(new Date('2026-05-31T00:00:00'))).toBe('2025-2026');
    expect(defaultSchoolYear(new Date('2026-01-01T00:00:00'))).toBe('2025-2026');
  });
});

describe('greeting', () => {
  it('matches the Laravel match(true) ladder', () => {
    expect(greeting(new Date('2026-01-01T08:00:00'))).toBe('Good morning');
    expect(greeting(new Date('2026-01-01T11:59:00'))).toBe('Good morning');
    expect(greeting(new Date('2026-01-01T12:00:00'))).toBe('Good afternoon');
    expect(greeting(new Date('2026-01-01T17:59:00'))).toBe('Good afternoon');
    expect(greeting(new Date('2026-01-01T18:00:00'))).toBe('Good evening');
  });
});

describe('fullName', () => {
  it('joins the parts and collapses the gap when there is no middle name', () => {
    expect(fullName({ firstName: 'Ana', middleName: 'Reyes', lastName: 'Cruz' })).toBe('Ana Reyes Cruz');
    expect(fullName({ firstName: 'Ana', middleName: null, lastName: 'Cruz' })).toBe('Ana Cruz');
    expect(fullName({ firstName: 'Ana', middleName: '', lastName: 'Cruz' })).toBe('Ana Cruz');
  });
});

describe('assignableRoles', () => {
  function user(roles: string[]): AuthUser {
    return {
      id: '1', name: 'T', username: null, email: 't@e.test',
      status: 'ACTIVE', emailVerifiedAt: new Date(), roles, permissions: [],
    };
  }

  it('lets only a super admin grant the admin role', () => {
    expect(assignableRoles(user(['super_admin']))).toEqual([...STAFF_ROLES]);
    expect(assignableRoles(user(['admin']))).not.toContain('admin');
  });

  it('never offers the student role from the Staff screen', () => {
    expect(assignableRoles(user(['super_admin']))).not.toContain('student');
    expect(assignableRoles(user(['admin']))).not.toContain('student');
  });
});
