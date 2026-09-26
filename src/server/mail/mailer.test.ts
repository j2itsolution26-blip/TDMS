import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  activeTransport,
  canSendMail,
  mailConfigurationProblem,
  mailFromAddress,
  sendMail,
} from './mailer';

/**
 * Transport selection and the unconfigured path.
 *
 * Nothing here opens a connection: the only call to `sendMail` is the one
 * where no transport is configured, which must fail before it tries. The two
 * real transports are exercised against a live provider, not a unit test.
 *
 * The behaviour under test is what replaced the old `log` transport. That one
 * wrote the message — verification link included — to the server log and
 * reported success in development, which made unconfigured deployments look
 * like working ones and put a live credential in the logs.
 */

const MAIL_KEYS = [
  'MAIL_HOST',
  'MAIL_PORT',
  'MAIL_USERNAME',
  'MAIL_PASSWORD',
  'MAIL_ENCRYPTION',
  'MAIL_FROM_ADDRESS',
  'MAIL_FROM_NAME',
  'MAIL_FROM',
  'RESEND_API_KEY',
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of MAIL_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of MAIL_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('transport selection', () => {
  it('is "none" when nothing is configured', () => {
    expect(activeTransport()).toBe('none');
    expect(canSendMail()).toBe(false);
  });

  it('prefers SMTP when MAIL_HOST and MAIL_PORT are set', () => {
    process.env.MAIL_HOST = 'smtp.example.test';
    process.env.MAIL_PORT = '587';
    process.env.RESEND_API_KEY = 'also-set';

    expect(activeTransport()).toBe('smtp');
  });

  it('falls back to Resend when there is no SMTP host', () => {
    process.env.RESEND_API_KEY = 'key';
    expect(activeTransport()).toBe('resend');
  });

  it('does not treat a host without a port as configured', () => {
    process.env.MAIL_HOST = 'smtp.example.test';
    expect(activeTransport()).toBe('none');
  });
});

describe('the sender address', () => {
  it('composes the name and address pair', () => {
    process.env.MAIL_FROM_ADDRESS = 'no-reply@asiancollege.edu.ph';
    process.env.MAIL_FROM_NAME = 'TDMS';
    expect(mailFromAddress()).toBe('TDMS <no-reply@asiancollege.edu.ph>');
  });

  it('uses a bare address when no name is given', () => {
    process.env.MAIL_FROM_ADDRESS = 'no-reply@asiancollege.edu.ph';
    expect(mailFromAddress()).toBe('no-reply@asiancollege.edu.ph');
  });

  it('honours the deprecated pre-composed MAIL_FROM', () => {
    process.env.MAIL_FROM = 'TDMS <no-reply@asiancollege.edu.ph>';
    expect(mailFromAddress()).toBe('TDMS <no-reply@asiancollege.edu.ph>');
  });

  it('has no default sender: a transport without one is not configured', () => {
    process.env.RESEND_API_KEY = 'key';

    expect(mailFromAddress()).toBe('');
    expect(canSendMail()).toBe(false);
    expect(mailConfigurationProblem()).toMatch(/MAIL_FROM_ADDRESS/);
  });
});

describe('the administrator-facing problem description', () => {
  it('names the variables to set, and no values', () => {
    const problem = mailConfigurationProblem()!;

    expect(problem).toMatch(/MAIL_HOST/);
    expect(problem).toMatch(/MAIL_FROM_ADDRESS/);
    expect(problem).toMatch(/RESEND_API_KEY/);
  });

  it('is null once mail is fully configured', () => {
    process.env.MAIL_HOST = 'smtp.example.test';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_FROM_ADDRESS = 'no-reply@asiancollege.edu.ph';

    expect(mailConfigurationProblem()).toBeNull();
    expect(canSendMail()).toBe(true);
  });
});

describe('sending with nothing configured', () => {
  it('reports failure rather than pretending, in development as in production', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await sendMail({
      to: 'jctan@asiancollege.edu.ph',
      subject: 'Verify your Super Admin account',
      text: 'Your verification code is:\n\n481902\n',
    });

    expect(result.delivered).toBe(false);
    expect(result.transport).toBe('none');
    expect(result.detail).toMatch(/MAIL_HOST/);
  });

  it('never writes the message body, a recipient or a code to the log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await sendMail({
      to: 'jctan@asiancollege.edu.ph',
      subject: 'Verify your Super Admin account',
      text: 'Your verification code is:\n\n481902\n',
    });

    const logged = [error, warn, log]
      .flatMap((spy) => spy.mock.calls)
      .map((call) => JSON.stringify(call))
      .join('\n');

    expect(logged).not.toContain('481902');
    expect(logged).not.toContain('jctan@asiancollege.edu.ph');
    expect(logged).not.toContain('Your verification code is');
    // It does say what is wrong, which is the whole value of the log line.
    expect(logged).toMatch(/no mail provider is configured/i);
  });
});
