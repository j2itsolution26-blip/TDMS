import { describe, expect, it } from 'vitest';
import {
  SECURITY_EVENTS,
  SYSTEM_ACTIVITY_EVENTS,
  TONE_BADGE_STATUS,
  dashboardRoleLabel,
  personLine,
} from '@shared/lib/audit-dashboard';
import { badgeTone } from '@/components/ui';

const ALL = { ...SYSTEM_ACTIVITY_EVENTS, ...SECURITY_EVENTS };

describe('dashboard event vocabulary', () => {
  it('uses the agreed readable names', () => {
    expect(SECURITY_EVENTS.ACCESS_CODE_EXPIRED!.label).toBe('Access code expired');
    expect(SECURITY_EVENTS.ADMIN_LOGIN_FAILED!.label).toBe('Administrator login failed');
    expect(SYSTEM_ACTIVITY_EVENTS.ACCESS_CODE_GENERATED!.label).toBe('Access code generated');
    expect(SYSTEM_ACTIVITY_EVENTS.ADMIN_SUSPENDED!.label).toBe('Administrator account suspended');
    expect(SYSTEM_ACTIVITY_EVENTS.TEMP_PASSWORD_REVEALED!.label).toBe('Temporary password issued');
    expect(SYSTEM_ACTIVITY_EVENTS.TEMP_PASSWORD_RESET!.label).toBe('Temporary password changed');
    expect(SYSTEM_ACTIVITY_EVENTS.ADMIN_CREATED!.label).toBe('Admin account created');
    expect(SYSTEM_ACTIVITY_EVENTS.AUDIT_LOG_EXPORTED!.label).toBe('Audit log exported');
  });

  it('never shows an internal code as a label', () => {
    for (const [code, event] of Object.entries(ALL)) {
      expect(event.label).not.toBe(code);
      expect(event.label).not.toMatch(/^[A-Z_]+$/);
      expect(event.label).not.toMatch(/_/);
    }
  });

  it('leaves out the first half of a two-step sign-in, so nothing reads "Step 1 of 2"', () => {
    expect(ALL.ADMIN_PASSWORD_ACCEPTED).toBeUndefined();
    for (const event of Object.values(ALL)) {
      expect(event.status?.label ?? '').not.toMatch(/step/i);
    }
  });

  it('gives every security event a status', () => {
    for (const event of Object.values(SECURITY_EVENTS)) {
      expect(event.status.label.length).toBeGreaterThan(0);
    }
  });

  it('colours statuses consistently: green, amber, red, red, blue', () => {
    expect(badgeTone(TONE_BADGE_STATUS.success)).toBe('positive');
    expect(badgeTone(TONE_BADGE_STATUS.attention)).toBe('attention');
    expect(badgeTone(TONE_BADGE_STATUS.failed)).toBe('negative');
    expect(badgeTone(TONE_BADGE_STATUS.expired)).toBe('negative');
    expect(badgeTone(TONE_BADGE_STATUS.info)).toBe('info');
  });

  it('names the person an export was made BY, since an export has no personal target', () => {
    expect(SYSTEM_ACTIVITY_EVENTS.AUDIT_LOG_EXPORTED!.subject).toBe('actor');
    expect(SYSTEM_ACTIVITY_EVENTS.ADMIN_CREATED!.subject).toBe('target');
  });
});

describe('person line', () => {
  it('reads "Name · Role", with Admin written out', () => {
    expect(personLine('James Tan', dashboardRoleLabel('admin'))).toBe('James Tan · Administrator');
    expect(personLine('Ana Cruz', dashboardRoleLabel('super_admin'))).toBe('Ana Cruz · Super Admin');
  });

  it('shows just the name when the role is not known', () => {
    expect(personLine('Former Admin', dashboardRoleLabel(null))).toBe('Former Admin');
    expect(dashboardRoleLabel('something_else')).toBeNull();
  });
});
