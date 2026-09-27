import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAIL_ERROR_REMEDY,
  activeTransport,
  canSendMail,
  classifySmtpError,
  configuredProvider,
  developmentMailMode,
  mailConfigurationProblem,
  mailConfigurationWarning,
  mailFromAddress,
  redactAddresses,
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
  'EMAIL_FROM',
  'EMAIL_PROVIDER',
  'EMAIL_VERIFICATION_MODE',
  'RESEND_API_KEY',
  'VERCEL',
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

  it('uses Resend when a key is present', () => {
    process.env.RESEND_API_KEY = 'key';
    expect(activeTransport()).toBe('resend');
  });

  /**
   * The regression this ordering exists for.
   *
   * A deployment kept MAIL_HOST=127.0.0.1 from an earlier local setup. Under
   * the old "SMTP first" rule that value won, and every send in production
   * tried to reach a mail server inside the function's own sandbox. A Resend
   * key must not be overridable by a leftover SMTP host.
   */
  it('prefers Resend over a configured SMTP host', () => {
    process.env.MAIL_HOST = 'smtp.example.test';
    process.env.MAIL_PORT = '587';
    process.env.RESEND_API_KEY = 'key';

    expect(activeTransport()).toBe('resend');
  });

  it('uses SMTP when that is all there is', () => {
    process.env.MAIL_HOST = 'smtp.example.test';
    process.env.MAIL_PORT = '587';

    expect(activeTransport()).toBe('smtp');
  });

  it('does not treat a host without a port as configured', () => {
    process.env.MAIL_HOST = 'smtp.example.test';
    expect(activeTransport()).toBe('none');
  });
});

describe('EMAIL_PROVIDER', () => {
  it('is null when unset, so the transport is derived', () => {
    expect(configuredProvider()).toBeNull();
  });

  it('forces SMTP even when a Resend key is present', () => {
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.MAIL_HOST = 'smtp.example.test';
    process.env.MAIL_PORT = '587';
    process.env.RESEND_API_KEY = 'key';

    expect(configuredProvider()).toBe('smtp');
    expect(activeTransport()).toBe('smtp');
  });

  /**
   * Asking for Resend without a key must NOT quietly fall through to SMTP.
   * Falling through is how a deployment ends up on a loopback host nobody
   * chose, which is the failure this change is about.
   */
  it('reports none when Resend is asked for without a key, never falling back to SMTP', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.MAIL_HOST = '127.0.0.1';
    process.env.MAIL_PORT = '1025';

    expect(activeTransport()).toBe('none');
    expect(canSendMail()).toBe(false);
  });

  it('ignores SMTP values entirely when Resend is selected', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 'key';
    process.env.EMAIL_FROM = 'TDMS <no-reply@tdms.test>';
    process.env.MAIL_HOST = '127.0.0.1';
    process.env.MAIL_PORT = '1025';

    expect(activeTransport()).toBe('resend');
    expect(mailConfigurationProblem()).toBeNull();
  });

  it('accepts development as an alias for the log transport, outside production', () => {
    process.env.EMAIL_PROVIDER = 'development';
    vi.stubEnv('NODE_ENV', 'development');

    expect(developmentMailMode()).toBe(true);
    expect(activeTransport()).toBe('log');
  });

  it('refuses development in production, and says so', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.EMAIL_PROVIDER = 'development';
    process.env.RESEND_API_KEY = 'key';
    process.env.EMAIL_FROM = 'TDMS <no-reply@tdms.test>';
    vi.stubEnv('NODE_ENV', 'production');

    expect(developmentMailMode()).toBe(false);
    expect(activeTransport()).toBe('resend');
    expect(JSON.stringify(error.mock.calls)).toMatch(/IGNORED/);
  });

  it('ignores an unrecognised value rather than taking email down', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.EMAIL_PROVIDER = 'sendgrid';
    process.env.RESEND_API_KEY = 'key';

    expect(configuredProvider()).toBeNull();
    expect(activeTransport()).toBe('resend');
    expect(JSON.stringify(error.mock.calls)).toMatch(/not recognised/);
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
    expect(mailConfigurationProblem()).toMatch(/EMAIL_FROM/);
  });
});

describe('the administrator-facing problem description', () => {
  it('names the variables to set, and no values', () => {
    const problem = mailConfigurationProblem()!;

    // The production path first, then the SMTP alternative.
    expect(problem).toMatch(/RESEND_API_KEY/);
    expect(problem).toMatch(/EMAIL_FROM/);
    expect(problem).toMatch(/MAIL_HOST/);
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
    // It does say what is wrong, which is the whole value of the log line,
    // in the fixed [EMAIL] / Provider / Status / Reason shape.
    expect(logged).toMatch(/\[EMAIL\]/);
    expect(logged).toMatch(/Status: SKIPPED/);
    expect(logged).toMatch(/not configured/i);
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

describe('a loopback MAIL_HOST is caught before it can fail at connect time', () => {
  const KEYS = ['MAIL_HOST', 'MAIL_PORT', 'MAIL_FROM_ADDRESS', 'VERCEL', 'EMAIL_VERIFICATION_MODE'] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
    process.env.MAIL_PORT = '2525';
    process.env.MAIL_FROM_ADDRESS = 'no-reply@asiancollege.edu.ph';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  for (const host of ['127.0.0.1', 'localhost', '::1', '0.0.0.0', '127.1.2.3']) {
    it(`reports ${host} as a misconfiguration when deployed`, () => {
      process.env.MAIL_HOST = host;
      vi.stubEnv('VERCEL', '1');
      const problem = mailConfigurationProblem();
      expect(problem).toMatch(/loopback/i);
      expect(problem).toContain(host);
      // canSendMail must go false, so registration refuses early and clearly
      // rather than attempting a connection that cannot succeed.
      expect(canSendMail()).toBe(false);
    });
  }

  it('allows a local mail catcher in development', () => {
    // Mailpit / MailHog on loopback is a normal development setup.
    process.env.MAIL_HOST = '127.0.0.1';
    vi.stubEnv('NODE_ENV', 'development');
    expect(mailConfigurationProblem()).toBeNull();
    expect(canSendMail()).toBe(true);
  });

  it('leaves a real host alone when deployed', () => {
    process.env.MAIL_HOST = 'smtp.gmail.com';
    vi.stubEnv('VERCEL', '1');
    expect(mailConfigurationProblem()).toBeNull();
    expect(canSendMail()).toBe(true);
  });

  it('names variables but never their values', () => {
    process.env.MAIL_HOST = 'localhost';
    process.env.MAIL_USERNAME = 'smtp-user@example.com';
    process.env.MAIL_PASSWORD = 'super-secret-password';
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('RESEND_API_KEY', 're_liveKey_abc123');

    /*
     * A key is present here, so the loopback host is inert and this is a
     * warning rather than a fault. Either way it names variables only.
     */
    const text = `${mailConfigurationProblem() ?? ''} ${mailConfigurationWarning() ?? ''}`;

    expect(text).toContain('MAIL_HOST');
    expect(text).not.toContain('re_liveKey_abc123');
    expect(text).not.toContain('super-secret-password');
    expect(text).not.toContain('smtp-user@example.com');
  });

  it('is inert once Resend is configured: a warning, not a failure', () => {
    process.env.MAIL_HOST = '127.0.0.1';
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('RESEND_API_KEY', 'key');
    vi.stubEnv('EMAIL_FROM', 'TDMS <no-reply@tdms.test>');

    expect(activeTransport()).toBe('resend');
    expect(canSendMail()).toBe(true);
    expect(mailConfigurationProblem()).toBeNull();
    expect(mailConfigurationWarning()).toMatch(/IGNORED/);
  });

  it('names the Resend remedy when there is no key to fall back to', () => {
    process.env.MAIL_HOST = '127.0.0.1';
    vi.stubEnv('VERCEL', '1');

    const problem = mailConfigurationProblem()!;
    expect(problem).toMatch(/loopback/i);
    expect(problem).toContain('RESEND_API_KEY');
    expect(problem).toContain('EMAIL_FROM');
    expect(activeTransport()).toBe('none');
  });
});

/**
 * The Resend path, with `fetch` stubbed.
 *
 * Nothing leaves the machine: the point is the mapping from what Resend says
 * to what TDMS does about it, and what reaches the server log. The real
 * endpoint is checked by `npm run mail:check`, which asks Resend for its
 * verified domains rather than sending anything.
 *
 * The statuses below are the ones Resend actually returns, confirmed against
 * the live API — in particular a malformed key is a **400**, not a 401, which
 * is why classification reads the body rather than trusting the status.
 */
describe('sending through Resend', () => {
  const MESSAGE = {
    to: 'jctan@asiancollege.edu.ph',
    subject: 'Verify your Super Admin account',
    text: 'Your verification code is:\n\n481902\n',
  };

  let logged: string;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_liveKey_abc123';
    process.env.EMAIL_FROM = 'TDMS <no-reply@tdms.test>';
    logged = '';

    for (const method of ['log', 'error', 'warn'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged += `${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
      });
    }
  });

  /** Stub one Resend response. */
  function respond(status: number, body: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      })),
    );
  }

  it('sends, and records the provider message id for tracing', async () => {
    respond(200, { id: '4ef9a417-02e9-4d39-ad75-9611e0fcc33c' });

    const result = await sendMail(MESSAGE);

    expect(result.delivered).toBe(true);
    expect(result.transport).toBe('resend');
    expect(logged).toMatch(/Provider: Resend/);
    expect(logged).toMatch(/Status: SENT/);
    expect(logged).toMatch(/4ef9a417/);
  });

  it('posts to Resend with the configured sender and the key in a header', async () => {
    respond(200, { id: 'x' });
    await sendMail(MESSAGE);

    const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(call[0]).toBe('https://api.resend.com/emails');

    const init = call[1] as { headers: Record<string, string>; body: string };
    expect(init.headers.Authorization).toBe('Bearer re_liveKey_abc123');
    expect(JSON.parse(init.body).from).toBe('TDMS <no-reply@tdms.test>');
  });

  const cases: [string, number, Record<string, string>, string][] = [
    // Confirmed against the live API: an invalid key is a 400 validation_error.
    ['a malformed API key', 400, { name: 'validation_error', message: 'API key is invalid' }, 'EMAIL_AUTH_FAILED'],
    ['a missing API key', 401, { name: 'missing_api_key', message: 'Missing API Key' }, 'EMAIL_AUTH_FAILED'],
    [
      'an unverified sender domain',
      403,
      { name: 'validation_error', message: 'The tdms.test domain is not verified. Please verify a domain before sending.' },
      'EMAIL_SENDER_NOT_VERIFIED',
    ],
    [
      'an account still in testing mode',
      403,
      { name: 'validation_error', message: 'You can only send testing emails to your own email address (owner@example.com).' },
      'EMAIL_SENDER_NOT_VERIFIED',
    ],
    ['rate limiting', 429, { name: 'rate_limit_exceeded', message: 'Too many requests.' }, 'EMAIL_PROVIDER_REJECTED'],
    ['a provider outage', 503, { name: 'internal_server_error', message: 'Something went wrong.' }, 'EMAIL_PROVIDER_REJECTED'],
  ];

  for (const [label, status, body, expected] of cases) {
    it(`maps ${label} to ${expected}`, async () => {
      respond(status, body);

      const result = await sendMail(MESSAGE);

      expect(result.delivered).toBe(false);
      expect(result.code).toBe(expected);
      // The user-facing detail is the remedy, never the provider's own text.
      expect(result.detail).toBe(MAIL_ERROR_REMEDY[expected as keyof typeof MAIL_ERROR_REMEDY]);
    });
  }

  it("logs the provider's actual reason, which is the point of the log line", async () => {
    respond(403, {
      name: 'validation_error',
      message: 'The tdms.test domain is not verified. Please verify a domain before sending.',
    });

    await sendMail(MESSAGE);

    expect(logged).toMatch(/\[EMAIL\]/);
    expect(logged).toMatch(/Provider: Resend/);
    expect(logged).toMatch(/Status: FAILED/);
    expect(logged).toMatch(/Reason: The tdms.test domain is not verified/);
    // The domain is kept: it is not a secret, and it is the whole diagnosis.
    expect(logged).toContain('tdms.test');
  });

  it('never logs the key, the recipient, the body or the code', async () => {
    respond(403, {
      name: 'validation_error',
      message: 'You can only send testing emails to your own email address (owner@example.com).',
    });

    await sendMail(MESSAGE);

    expect(logged).not.toContain('re_liveKey_abc123');
    expect(logged).not.toContain('481902');
    expect(logged).not.toContain('jctan@asiancollege.edu.ph');
    expect(logged).not.toContain('Your verification code is');
    // The address Resend quoted back is redacted, the sentence survives.
    expect(logged).not.toContain('owner@example.com');
    expect(logged).toContain('[address]');
  });

  it('classifies a network failure rather than reporting it as a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Object.assign(new Error('getaddrinfo ENOTFOUND api.resend.com'), { code: 'ENOTFOUND' });
      }),
    );

    const result = await sendMail(MESSAGE);

    expect(result.delivered).toBe(false);
    expect(result.code).toBe('EMAIL_CONNECTION_FAILED');
    expect(logged).toMatch(/Status: FAILED/);
  });
});

describe('redactAddresses', () => {
  it('removes addresses and keeps the sentence', () => {
    expect(redactAddresses('only to your own address (owner@example.com).')).toBe(
      'only to your own address ([address]).',
    );
  });

  it('leaves a bare domain alone, because that is the diagnosis', () => {
    expect(redactAddresses('The tdms.test domain is not verified.')).toBe(
      'The tdms.test domain is not verified.',
    );
  });

  it('handles several addresses in one message', () => {
    expect(redactAddresses('a@b.com and c.d+tag@e.co.uk')).toBe('[address] and [address]');
  });
});
