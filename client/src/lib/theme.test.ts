import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OUTSIDE_APP, resolveTheme, shellFor } from './theme';

describe('resolveTheme', () => {
  it('a choice the person made wins over the device', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
  it('without a choice, it follows the device', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });
  it('ignores anything else that may be stored', () => {
    expect(resolveTheme('purple', true)).toBe('dark');
    expect(resolveTheme('', false)).toBe('light');
  });
});

describe('shellFor', () => {
  it('the sign-in, password, setup and print pages keep their own light design', () => {
    for (const p of ['/login', '/login/access-code', '/forgot-password', '/reset-password', '/verify-email', '/change-password', '/setup', '/assessment/reports/print']) {
      expect(shellFor(p)).toBe('auth');
    }
  });
  it('everything inside the signed-in workspace follows the theme', () => {
    for (const p of ['/dashboard', '/class-setup', '/students/12/enrollment', '/assessment/reports', '/loginx', '/']) {
      expect(shellFor(p)).toBe('app');
    }
  });
});

describe('theme-init.js (runs before React, so it cannot import this module)', () => {
  const script = readFileSync(fileURLToPath(new URL('../../public/theme-init.js', import.meta.url)), 'utf8');
  it('lists exactly the same pages outside the workspace', () => {
    const listed = JSON.parse(script.match(/OUTSIDE_APP\s*=\s*(\[[^\]]*\])/)![1]!.replace(/'/g, '"'));
    expect(listed).toEqual([...OUTSIDE_APP]);
  });
  it('uses the same storage key', () => {
    expect(script).toContain("'tdms.theme'");
  });
});
