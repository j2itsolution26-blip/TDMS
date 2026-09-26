import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  programSchema,
  subjectSchema,
  studentSchema,
  enrollmentSchema,
  curriculumSubjectSchema,
  inviteAccountSchema,
  idSchema,
  fieldErrors,
} from './schemas';

describe('loginSchema', () => {
  it('accepts a bare username', () => {
    // The whole point of the migration's auth fix: this must NOT be
    // validated as an email, or no username can ever sign in.
    const parsed = loginSchema.parse({ identifier: 'director', password: 'x' });
    expect(parsed.identifier).toBe('director');
    expect(parsed.remember).toBe(false);
  });

  it('accepts an email', () => {
    expect(loginSchema.parse({ identifier: 'a@b.test', password: 'x' }).identifier).toBe('a@b.test');
  });

  it('trims surrounding whitespace', () => {
    expect(loginSchema.parse({ identifier: '  director  ', password: 'x' }).identifier).toBe('director');
  });

  it('rejects an empty identifier or password', () => {
    expect(loginSchema.safeParse({ identifier: '', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ identifier: 'a', password: '' }).success).toBe(false);
  });
});

describe('Laravel rule parity', () => {
  it('caps a program code at 20 characters', () => {
    const base = { name: 'N', description: '', isActive: true };
    expect(programSchema.safeParse({ ...base, code: 'A'.repeat(20) }).success).toBe(true);
    expect(programSchema.safeParse({ ...base, code: 'A'.repeat(21) }).success).toBe(false);
  });

  it('caps subject units at 99 and restricts the type', () => {
    const base = { code: 'C', title: 'T', description: '', isActive: true };
    expect(subjectSchema.safeParse({ ...base, subjectType: 'lecture', defaultUnits: 99 }).success).toBe(true);
    expect(subjectSchema.safeParse({ ...base, subjectType: 'lecture', defaultUnits: 100 }).success).toBe(false);
    expect(subjectSchema.safeParse({ ...base, subjectType: 'seminar', defaultUnits: 3 }).success).toBe(false);
  });

  it('limits student year level to 1-4', () => {
    const base = {
      firstName: 'A', middleName: '', lastName: 'B', email: '', phone: '',
      dateOfBirth: '', programId: '1', curriculumId: '2', status: 'active', enrollmentDate: '',
    };
    expect(studentSchema.safeParse({ ...base, yearLevel: 4 }).success).toBe(true);
    expect(studentSchema.safeParse({ ...base, yearLevel: 5 }).success).toBe(false);
    expect(studentSchema.safeParse({ ...base, yearLevel: 0 }).success).toBe(false);
  });

  it('turns empty optional strings into null', () => {
    const parsed = studentSchema.parse({
      firstName: 'A', middleName: '', lastName: 'B', email: '', phone: '',
      dateOfBirth: '', programId: '1', curriculumId: '2', yearLevel: 1,
      status: 'active', enrollmentDate: '',
    });
    expect(parsed.middleName).toBeNull();
    expect(parsed.email).toBeNull();
    expect(parsed.dateOfBirth).toBeNull();
  });

  it('enforces the YYYY-YYYY school year format', () => {
    const base = { studentId: '1', curriculumId: '1', semester: 1, yearLevel: 1 };
    expect(enrollmentSchema.safeParse({ ...base, schoolYear: '2026-2027' }).success).toBe(true);
    expect(enrollmentSchema.safeParse({ ...base, schoolYear: '2026' }).success).toBe(false);
    expect(enrollmentSchema.safeParse({ ...base, schoolYear: '26-27' }).success).toBe(false);
  });

  it('rejects a prerequisite equal to the subject', () => {
    const base = { curriculumId: '1', yearLevel: 1, semester: 1, units: 3 };
    expect(curriculumSubjectSchema.safeParse({ ...base, subjectId: '5', prerequisiteSubjectId: '5' }).success).toBe(false);
    expect(curriculumSubjectSchema.safeParse({ ...base, subjectId: '5', prerequisiteSubjectId: '6' }).success).toBe(true);
    expect(curriculumSubjectSchema.safeParse({ ...base, subjectId: '5', prerequisiteSubjectId: null }).success).toBe(true);
  });

  it('will not let the Staff screen create a student account', () => {
    const base = { name: 'N', email: 'a@asiancollege.edu.ph' };
    expect(inviteAccountSchema.safeParse({ ...base, role: 'secretary' }).success).toBe(true);
    expect(inviteAccountSchema.safeParse({ ...base, role: 'student' }).success).toBe(false);
  });

  it('refuses a non-institutional address on the server, whatever the form sent', () => {
    for (const email of ['a@gmail.com', 'a@tdms.test', 'a@asiancollege.edu.ph.evil.com']) {
      const result = inviteAccountSchema.safeParse({ name: 'N', email, role: 'secretary' });
      expect(result.success).toBe(false);
    }
  });

  it('stores the normalised address', () => {
    const parsed = inviteAccountSchema.parse({
      name: '  Maria Santos ',
      email: '  Maria.Santos@AsianCollege.EDU.ph ',
      role: 'secretary',
    });
    expect(parsed.email).toBe('maria.santos@asiancollege.edu.ph');
    expect(parsed.name).toBe('Maria Santos');
  });
});

describe('idSchema', () => {
  it('coerces numeric strings to bigint', () => {
    expect(idSchema.parse('42')).toBe(42n);
    expect(idSchema.parse(42)).toBe(42n);
  });

  it('rejects anything that is not a positive integer', () => {
    for (const bad of ['abc', '1; DROP TABLE users', '-1', '1.5', '']) {
      expect(idSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('fieldErrors', () => {
  it('groups messages by field path', () => {
    const result = programSchema.safeParse({ code: '', name: '', description: '', isActive: true });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = fieldErrors(result.error);
    expect(Object.keys(errors)).toContain('code');
    expect(Object.keys(errors)).toContain('name');
    expect(Array.isArray(errors.code)).toBe(true);
  });
});
