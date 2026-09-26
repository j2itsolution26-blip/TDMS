import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAIL_ERROR_REMEDY, activeTransport, canSendMail, classifySmtpError, developmentMailMode, mailConfigurationProblem, mailFromAddress, sendMail } from './mailer';

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

describe('EMAIL_VERIFICATION_MODE=development', () => {
  const KEYS = ['EMAIL_VERIFICATION_MODE', 'MAIL_HOST', 'MAIL_PORT', 'RESEND_API_KEY'] as const;

  /** NODE_ENV is readonly in the Node types; this is the supported route. */
  const setNodeEnv = (value: string) => vi.stubEnv('NODE_ENV', value);
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('is off unless explicitly asked for', () => {
    expect(developmentMailMode()).toBe(false);
    expect(activeTransport()).toBe('none');
  });

  it('is never inferred from the absence of a provider', () => {
    // No provider configured must fail loudly, not quietly pretend to send.
    expect(activeTransport()).toBe('none');
    expect(canSendMail()).toBe(false);
  });

  it('activates on an explicit opt-in outside production', () => {
    process.env.EMAIL_VERIFICATION_MODE = 'development';
    setNodeEnv('development');
    expect(developmentMailMode()).toBe(true);
    expect(activeTransport()).toBe('log');
    expect(canSendMail()).toBe(true);
  });

  it('takes precedence over a configured SMTP host', () => {
    process.env.EMAIL_VERIFICATION_MODE = 'development';
    setNodeEnv('development');
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    expect(activeTransport()).toBe('log');
  });

  it('is REFUSED in production, however it is set', () => {
    // A verification code in a production log is a credential somewhere far
    // more people can read than the mailbox it was meant for.
    process.env.EMAIL_VERIFICATION_MODE = 'development';
    setNodeEnv('production');
    expect(developmentMailMode()).toBe(false);
    expect(activeTransport()).toBe('none');
    expect(canSendMail()).toBe(false);
  });

  it('falls back to a real provider in production rather than the log', () => {
    process.env.EMAIL_VERIFICATION_MODE = 'development';
    setNodeEnv('production');
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    expect(activeTransport()).toBe('smtp');
  });

  it('only the exact word enables it', () => {
    setNodeEnv('development');
    for (const value of ['dev', 'true', '1', 'DEVELOPMENTAL', '']) {
      process.env.EMAIL_VERIFICATION_MODE = value;
      expect(developmentMailMode()).toBe(false);
    }
    process.env.EMAIL_VERIFICATION_MODE = 'DEVELOPMENT';
    expect(developmentMailMode()).toBe(true);
  });
});

describe('classifySmtpError', () => {
  /**
   * These are the distinctions that matter operationally: a wrong password,
   * an unreachable host and an unverified sender have three different fixes,
   * and collapsing them into "couldn't send" is what made the original
   * failure so hard to place.
   */
  const cases: [string, Record<string, unknown>, string][] = [
    ['EAUTH from nodemailer', { code: 'EAUTH' }, 'EMAIL_AUTH_FAILED'],
    ['SMTP 535 bad credentials', { responseCode: 535 }, 'EMAIL_AUTH_FAILED'],
    ['SMTP 534 app password required', { responseCode: 534 }, 'EMAIL_AUTH_FAILED'],
    ['host not found', { code: 'ENOTFOUND' }, 'EMAIL_CONNECTION_FAILED'],
    ['connection refused', { code: 'ECONNREFUSED' }, 'EMAIL_CONNECTION_FAILED'],
    ['TLS socket failure', { code: 'ESOCKET' }, 'EMAIL_CONNECTION_FAILED'],
    ['timed out', { code: 'ETIMEDOUT' }, 'EMAIL_TIMEOUT'],
    [
      'unverified sender',
      { responseCode: 553, response: '553 Sender address is not verified' },
      'EMAIL_SENDER_NOT_VERIFIED',
    ],
    [
      'relay denied',
      { responseCode: 554, response: '554 Relay access denied' },
      'EMAIL_SENDER_NOT_VERIFIED',
    ],
    ['generic 5xx', { responseCode: 550, response: '550 mailbox unavailable' }, 'EMAIL_PROVIDER_REJECTED'],
    ['nothing recognisable', {}, 'EMAIL_PROVIDER_REJECTED'],
  ];

  for (const [name, shape, expected] of cases) {
    it(`maps ${name} to ${expected}`, () => {
      const error = Object.assign(new Error('boom'), shape);
      expect(classifySmtpError(error)).toBe(expected);
    });
  }

  it('has a remedy for every code, and none of them leaks a value', () => {
    for (const [code, remedy] of Object.entries(MAIL_ERROR_REMEDY)) {
      expect(remedy.length).toBeGreaterThan(10);
      expect(remedy).not.toMatch(/password=|:\/\/|@[a-z0-9.-]+\.[a-z]{2,}/i);
      expect(code).toMatch(/^EMAIL_/);
    }
  });

  it('names App Passwords for the auth case, because that is the usual Gmail cause', () => {
    expect(MAIL_ERROR_REMEDY.EMAIL_AUTH_FAILED).toMatch(/app password/i);
  });
});
