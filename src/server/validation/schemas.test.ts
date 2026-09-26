import { describe, it, expect , beforeEach, afterEach } from 'vitest';
import {
  loginSchema,
  programSchema,
  subjectSchema,
  studentSchema,
  enrollmentSchema,
  curriculumSubjectSchema,
  inviteAccountSchema,
  superAdminRegistrationSchema,
  verificationCodeSchema,
  idSchema,
  fieldErrors,
} from './schemas';

/*
 * These cases describe the RESTRICTED policy, so they switch it on
 * explicitly. The restriction now defaults to off for development (see
 * src/lib/domain-policy.test.ts), and a test that silently depended on the
 * old default would quietly stop testing anything.
 */
let savedRestriction: string | undefined;
let savedDomain: string | undefined;

beforeEach(() => {
  savedRestriction = process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;
  savedDomain = process.env.GOOGLE_ALLOWED_DOMAIN;
  process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED = 'true';
  process.env.GOOGLE_ALLOWED_DOMAIN = 'asiancollege.edu.ph';
});

afterEach(() => {
  if (savedRestriction === undefined) delete process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED;
  else process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED = savedRestriction;
  if (savedDomain === undefined) delete process.env.GOOGLE_ALLOWED_DOMAIN;
  else process.env.GOOGLE_ALLOWED_DOMAIN = savedDomain;
});

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

/**
 * Super Admin registration, step 1.
 *
 * Every one of these is refused before a verification code is sent, so none of
 * them can reach the point where an account could be created.
 */
describe('superAdminRegistrationSchema', () => {
  const valid = {
    name: 'James C. Tan',
    email: 'jctan@asiancollege.edu.ph',
    password: 'Institution#2026',
    passwordConfirmation: 'Institution#2026',
  };

  it('accepts a complete, valid registration', () => {
    const parsed = superAdminRegistrationSchema.parse(valid);
    expect(parsed.email).toBe('jctan@asiancollege.edu.ph');
    expect(parsed.name).toBe('James C. Tan');
  });

  it('normalises the address and trims the name', () => {
    const parsed = superAdminRegistrationSchema.parse({
      ...valid,
      name: '  James C. Tan  ',
      email: '  JCTan@AsianCollege.EDU.ph ',
    });
    expect(parsed.email).toBe('jctan@asiancollege.edu.ph');
    expect(parsed.name).toBe('James C. Tan');
  });

  it('refuses personal email providers and domain lookalikes', () => {
    const rejected = [
      'jctan@gmail.com',
      'jctan@yahoo.com',
      'jctan@outlook.com',
      'jctan@hotmail.com',
      'jctan@notasiancollege.edu.ph',
      'jctan@asiancollege.edu.ph.evil.com',
      'jctan@sub.asiancollege.edu.ph',
      'jctan@asiancollege-edu.ph',
      'jctan@b@asiancollege.edu.ph',
    ];

    for (const email of rejected) {
      const result = superAdminRegistrationSchema.safeParse({ ...valid, email });
      expect(result.success, email).toBe(false);
    }
  });

  it('tells a registering user which address to use, in those words', () => {
    const result = superAdminRegistrationSchema.safeParse({ ...valid, email: 'jctan@gmail.com' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error).email).toContain(
      'Please use your @asiancollege.edu.ph institutional email.',
    );
  });

  it('rejects a malformed address even on the right domain', () => {
    for (const email of ['@asiancollege.edu.ph', '.jctan@asiancollege.edu.ph', 'jc tan@asiancollege.edu.ph']) {
      expect(superAdminRegistrationSchema.safeParse({ ...valid, email }).success, email).toBe(false);
    }
  });

  it('requires a name', () => {
    expect(superAdminRegistrationSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });

  it('applies the full password policy', () => {
    const weak = [
      'short',                 // too short, and missing classes
      'Abcdefg1#zZ',           // eleven characters
      'institution#2026',      // no uppercase
      'INSTITUTION#2026',      // no lowercase
      'Institutional#Pw',      // no number
      'Institution20268',      // no symbol
    ];

    for (const password of weak) {
      const result = superAdminRegistrationSchema.safeParse({
        ...valid,
        password,
        passwordConfirmation: password,
      });
      expect(result.success, password).toBe(false);
    }
  });

  it('reports every password failure at once, on the password field', () => {
    const result = superAdminRegistrationSchema.safeParse({
      ...valid,
      password: 'short',
      passwordConfirmation: 'short',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error).password!.length).toBeGreaterThan(1);
  });

  it('rejects a mismatched confirmation, against the confirmation field', () => {
    const result = superAdminRegistrationSchema.safeParse({
      ...valid,
      passwordConfirmation: 'Institution#2027',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error).passwordConfirmation).toContain('Passwords do not match.');
  });
});

describe('verificationCodeSchema', () => {
  it('accepts six digits, including a leading zero', () => {
    expect(verificationCodeSchema.parse({ code: '123456' }).code).toBe('123456');
    expect(verificationCodeSchema.parse({ code: '000123' }).code).toBe('000123');
  });

  it('tolerates the spacing a mail client may introduce on a paste', () => {
    expect(verificationCodeSchema.parse({ code: '123 456' }).code).toBe('123456');
    expect(verificationCodeSchema.parse({ code: '123-456' }).code).toBe('123456');
  });

  it('refuses anything that is not six digits', () => {
    for (const code of ['12345', '1234567', 'abcdef', '12345a', '', '  ']) {
      expect(verificationCodeSchema.safeParse({ code }).success, code).toBe(false);
    }
  });
});
