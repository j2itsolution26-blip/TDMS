import { describe, expect, it } from 'vitest';
import { ACCOUNT_EVENTS, accountTarget, describeDevice } from './account-activity';

describe('describeDevice', () => {
  it('summarises the browser and system actually sent', () => {
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36')).toBe('Chrome on Windows');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0')).toBe('Edge on Windows');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS');
    expect(describeDevice('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36')).toBe('Chrome on Android');
    expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Firefox on macOS');
  });
  it('nothing sent, nothing guessed', () => {
    expect(describeDevice(null)).toBeNull();
    expect(describeDevice('')).toBeNull();
    expect(describeDevice('curl/8.4.0')).toBeNull();
  });
});

describe('account events', () => {
  it('records new events under the account id', () => {
    expect(accountTarget(42n)).toBe('User 42');
  });
  it('lists only events about an account — never what an admin did to others', () => {
    expect(Object.keys(ACCOUNT_EVENTS)).toEqual(expect.arrayContaining(['LOGIN_SUCCESS', 'PROFILE_UPDATED', 'PASSWORD_CHANGED']));
    expect(ACCOUNT_EVENTS).not.toHaveProperty('TEMP_PASSWORD_REVEALED');
    expect(ACCOUNT_EVENTS).not.toHaveProperty('ADMIN_LOGIN_FAILED');
  });
});
