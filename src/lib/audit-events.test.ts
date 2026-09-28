import { describe, it, expect } from 'vitest';
import {
  describeEvent,
  codesInCategory,
  codesWithSeverity,
  codesMatching,
  parseParty,
  isTestAddress,
  formatDetails,
  highlights,
  redactedDetails,
  TEST_ADDRESS_FRAGMENTS,
} from './audit-events';

describe('readable event names (the brief\'s examples)', () => {
  it.each([
    ['ADMIN_SUSPENDED', 'Admin suspended'],
    ['ADMIN_PASSWORD_ACCEPTED', 'Password accepted'],
    ['ACCESS_CODE_GENERATED', 'Access code generated'],
    ['TEMP_PASSWORD_REVEALED', 'Temporary password revealed'],
    ['TEMP_PASSWORD_RESET', 'Temporary password reset'],
    ['ACCESS_CODE_EXPIRED', 'Access code expired'],
  ])('%s reads as "%s"', (code, label) => {
    expect(describeEvent(code).label).toBe(label);
    // The original code is kept alongside.
    expect(describeEvent(code).code).toBe(code);
  });

  it('reads older codes still in the database the same as their current names', () => {
    expect(describeEvent('ADMIN_ACCESS_CODE_GENERATED').label).toBe(describeEvent('ACCESS_CODE_GENERATED').label);
    expect(describeEvent('TEMP_PASSWORD_USED').label).toBe(describeEvent('TEMP_PASSWORD_CHANGED').label);
  });

  it('never hides an unknown code — it is humanised into Other', () => {
    const e = describeEvent('SOMETHING_NEW_HAPPENED');
    expect(e).toMatchObject({ known: false, label: 'Something new happened', category: 'other', severity: 'activity' });
  });
});

describe('severity (the brief\'s examples)', () => {
  it('maps as specified', () => {
    expect(describeEvent('ACCESS_CODE_GENERATED').severity).toBe('info');
    expect(describeEvent('ACCESS_CODE_EXPIRED').severity).toBe('warning');
    expect(describeEvent('ADMIN_SUSPENDED').severity).toBe('security');
    expect(describeEvent('TEMP_PASSWORD_RESET').severity).toBe('security');
    expect(describeEvent('STAFF_CREATED').severity).toBe('activity');
  });

  it('puts every known code in exactly one severity and one category', () => {
    const all = ['info', 'activity', 'warning', 'security'].flatMap((s) => codesWithSeverity(s as never));
    expect(new Set(all).size).toBe(all.length);
    expect(codesInCategory('access_code')).toContain('ACCESS_CODE_REVOKED');
  });
});

describe('search by readable name', () => {
  it('finds codes from the words people type', () => {
    expect(codesMatching('suspended')).toEqual(expect.arrayContaining(['ADMIN_SUSPENDED', 'ACCOUNT_SUSPENDED']));
    expect(codesMatching('access code')).toContain('ACCESS_CODE_GENERATED');
    expect(codesMatching('')).toEqual([]);
  });
});

describe('people', () => {
  it('splits "Name <email>"', () => {
    expect(parseParty('James Tan <jctan.student@gmail.com>')).toMatchObject({ name: 'James Tan', email: 'jctan.student@gmail.com' });
  });
  it('handles the other stored shapes', () => {
    expect(parseParty('SELF_SERVICE')).toMatchObject({ name: 'The account holder', email: null });
    expect(parseParty('Pending Super Admin (a@b.com)')).toMatchObject({ name: 'Pending Super Admin', email: 'a@b.com' });
    expect(parseParty('user #12')).toMatchObject({ name: 'user #12', email: null });
  });
});

describe('test addresses — a narrow, principled rule', () => {
  it('recognises reserved domains and the old e2e- prefix', () => {
    for (const a of ['e2e-owner@example.test', 'x@foo.example', 'y@example.com', 'e2e-james-1@gmail.com']) {
      expect(isTestAddress(a), a).toBe(true);
    }
  });
  it('never flags a real-looking address', () => {
    for (const a of ['jctan.student@gmail.com', 'tester@asiancollege.edu.ph', 'j2itsolution26@gmail.com', 'teste2e@gmail.com']) {
      expect(isTestAddress(a), a).toBe(false);
    }
  });
  it('the SQL fragments agree with the rule on stored rows', () => {
    const stored = (email: string) => `Someone <${email}>`;
    const hit = (s: string) => TEST_ADDRESS_FRAGMENTS.some((f) => s.includes(f));
    expect(hit(stored('e2e-owner@example.test'))).toBe(true);
    expect(hit(stored('e2e-maria-1@gmail.com'))).toBe(true);
    expect(hit(stored('jctan.student@gmail.com'))).toBe(false);
  });
});

describe('details', () => {
  const details = {
    must_change_password: true,
    sessions_revoked: true,
    access_codes_revoked: 0,
    from_status: 'ACTIVE',
    email_confirmation: 'already_confirmed',
  };

  it('become structured, labelled fields (the brief\'s example)', () => {
    const f = Object.fromEntries(formatDetails(details).map((d) => [d.label, d.value]));
    expect(f).toEqual({
      'Password change required': 'Yes',
      'Sessions revoked': 'Yes',
      'Access codes revoked': '0',
      'Previous status': 'Active',
      'Email confirmation': 'Already confirmed',
    });
  });

  it('shows a status change as "Active → Suspended" on the row', () => {
    expect(highlights({ from_status: 'ACTIVE', to_status: 'SUSPENDED', access_codes_revoked: 1 })[0]).toMatchObject({
      label: 'Status changed',
      value: 'Active → Suspended',
    });
  });

  it('never shows a secret-shaped value, in the fields or the technical view', () => {
    const leaky = { temporary_password: 'Tmp#Secret2026', access_code: '482913', code_id: '17', password_hash: '$2b$x' };
    const shown = JSON.stringify(formatDetails(leaky)) + JSON.stringify(redactedDetails(leaky));
    expect(shown).not.toContain('Tmp#Secret2026');
    expect(shown).not.toContain('482913');
    expect(shown).not.toContain('$2b$x');
    // An id is not a secret.
    expect(shown).toContain('17');
  });

  it('keeps every key — nothing is dropped to look tidy', () => {
    expect(formatDetails({ some_new_field: 'x', role: 'admin' })).toHaveLength(2);
  });
});
