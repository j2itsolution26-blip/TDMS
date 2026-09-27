import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Outbound email. The only place in the application that talks to a mail
 * provider; everything else goes through the message helpers in messages.ts
 * (`sendVerificationEmail`, `sendSuperAdminCodeEmail`, …), so the provider
 * stays replaceable and no component ever holds a credential.
 *
 * Transports:
 *
 *   * `resend` — RESEND_API_KEY. An HTTP API: no outbound SMTP connection, no
 *                connection pool, nothing to keep warm. This is the
 *                production transport, and the default whenever a key exists.
 *   * `smtp`   — MAIL_HOST + MAIL_PORT. For an institutional mail server, or a
 *                local mail catcher during development. Opt-in only now: see
 *                the precedence note below.
 *   * `log`    — development only, explicitly asked for, writes the message to
 *                the server log instead of sending it.
 *   * `none`   — nothing usable is configured. Sending FAILS. It does not
 *                pretend, and callers refuse to proceed.
 *
 * PRECEDENCE, AND WHY RESEND COMES FIRST
 *
 * Selection used to be "SMTP if MAIL_HOST is set, else Resend". That is the
 * bug this ordering fixes. A deployment that had once been pointed at a local
 * mail catcher still carried `MAIL_HOST=127.0.0.1` in its environment, so SMTP
 * won, and every send in production tried to reach a mail server inside the
 * serverless function's own sandbox — where nothing is listening and nothing
 * ever could be.
 *
 * So a Resend key now wins by default, and a leftover SMTP host cannot hijack
 * delivery. EMAIL_PROVIDER overrides the default explicitly in either
 * direction, which is the only way to get SMTP while a key is present.
 *
 * No credential is ever hard-coded, defaulted, or written to a log line.
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text. Deliberately not HTML: nothing here needs markup. */
  text: string;
}

export type MailTransport = 'smtp' | 'resend' | 'log' | 'none';

/**
 * A stable label for the KIND of mail failure.
 *
 * These exist so a failure can be identified from the API response alone.
 * Without them every mail problem looks the same from outside — "couldn't
 * send" — and the only way to tell an unreachable host from a rejected
 * password is to read the server log, which is not always to hand.
 *
 * Each names a class of problem and a remedy. None carries a host, a
 * credential, or the provider's own text.
 */
export type MailErrorCode =
  | 'EMAIL_SERVICE_NOT_CONFIGURED'
  | 'EMAIL_AUTH_FAILED'
  | 'EMAIL_SENDER_NOT_VERIFIED'
  | 'EMAIL_PROVIDER_REJECTED'
  | 'EMAIL_CONNECTION_FAILED'
  | 'EMAIL_TIMEOUT';

/** What an operator should do about each code. Safe to show on the setup screen. */
export const MAIL_ERROR_REMEDY: Record<MailErrorCode, string> = {
  EMAIL_SERVICE_NOT_CONFIGURED:
    'Email delivery is not configured on the server.',
  EMAIL_AUTH_FAILED:
    'The mail server rejected the username or password. If this is Gmail or Google Workspace, an ordinary account password will not work — an App Password is required.',
  EMAIL_SENDER_NOT_VERIFIED:
    'The mail provider will not send from that sender address. Verify the sender or its domain with the provider first.',
  EMAIL_PROVIDER_REJECTED:
    'The mail server refused the message.',
  EMAIL_CONNECTION_FAILED:
    'The mail server could not be reached. Check the host and port, and that outbound SMTP is permitted.',
  EMAIL_TIMEOUT:
    'The mail server did not respond in time.',
};

/**
 * Classify a transport failure.
 *
 * nodemailer surfaces a `code` for connection-level problems and a
 * `responseCode` for what the SMTP server said. Both are consulted, because
 * a wrong password and an unreachable host are different problems with
 * different fixes and they must not collapse into one message.
 */
export function classifySmtpError(error: unknown): MailErrorCode {
  const e = error as { code?: unknown; responseCode?: unknown; response?: unknown };
  const code = typeof e?.code === 'string' ? e.code : '';
  const responseCode = typeof e?.responseCode === 'number' ? e.responseCode : 0;
  const response = typeof e?.response === 'string' ? e.response.toLowerCase() : '';

  if (code === 'EAUTH' || responseCode === 535 || responseCode === 534 || responseCode === 530) {
    return 'EMAIL_AUTH_FAILED';
  }

  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || code === 'ECONNRESET') {
    return 'EMAIL_TIMEOUT';
  }

  if (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EDNS' ||
    code === 'EHOSTUNREACH' ||
    code === 'ESOCKET'
  ) {
    return 'EMAIL_CONNECTION_FAILED';
  }

  /*
   * A 5xx mentioning the sender is almost always an unverified From — the
   * single most common mistake with a hosted provider, and worth naming
   * separately because the fix is in the provider's console, not here.
   */
  if (
    /sender|from address|not verified|unverified|domain is not|relay access denied/.test(response)
  ) {
    return 'EMAIL_SENDER_NOT_VERIFIED';
  }

  if (responseCode >= 500) return 'EMAIL_PROVIDER_REJECTED';
  if (responseCode >= 400) return 'EMAIL_TIMEOUT';

  return 'EMAIL_PROVIDER_REJECTED';
}

/** How a transport is named in a log line. */
function providerLabel(transport: MailTransport): string {
  if (transport === 'resend') return 'Resend';
  if (transport === 'smtp') return 'SMTP';
  if (transport === 'log') return 'development log';
  return 'none';
}

/**
 * The one shape every mail outcome is logged in.
 *
 * Fixed and greppable, because this is what somebody reads at two in the
 * morning when a code did not arrive:
 *
 *   [EMAIL]
 *   Provider: Resend
 *   Status: FAILED
 *   Reason: The domain example.com is not verified.
 *
 * What is in it: the provider, the outcome, the provider's own reason, and
 * identifiers that help trace a message. What is never in it: the API key, the
 * SMTP password, the recipient, the subject's message body, or the verification
 * code — the body is not passed to this function at all, and addresses are
 * redacted out of provider text before it arrives.
 */
function logEmail(
  status: 'SENT' | 'FAILED' | 'SKIPPED',
  provider: string,
  reason: string,
  extra: Record<string, unknown> = {},
): void {
  const lines = ['[EMAIL]', `Provider: ${provider}`, `Status: ${status}`, `Reason: ${reason}`];

  for (const [key, value] of Object.entries(extra)) {
    if (value === null || value === undefined) continue;
    lines.push(`${key}: ${String(value)}`);
  }

  const text = lines.join('\n');
  if (status === 'SENT') console.log(text);
  else console.error(text);
}

export interface MailResult {
  delivered: boolean;
  transport: MailTransport;
  /**
   * Safe to show an administrator. Never contains the message body, a
   * credential, a recipient, or a provider's raw error text.
   */
  detail?: string;
  /** Present only on failure. See MailErrorCode. */
  code?: MailErrorCode;
}

/** True when every value SMTP needs is present. */
function smtpConfigured(): boolean {
  return Boolean(process.env.MAIL_HOST && process.env.MAIL_PORT);
}

/**
 * The provider an operator asked for, if any.
 *
 * EMAIL_PROVIDER is the explicit switch:
 *
 *   resend       use the HTTP API. Required in production.
 *   smtp         use MAIL_HOST/MAIL_PORT even though a Resend key exists.
 *   development  write the message to the server log instead of sending it.
 *                Refused in production — see developmentMailMode().
 *
 * Unset means "decide from what is configured", which prefers Resend. An
 * unrecognised value is ignored rather than fatal, and says so once, because a
 * typo here must not take email down in a deployment that is otherwise
 * correctly configured.
 */
export type EmailProvider = 'resend' | 'smtp' | 'development';

export function configuredProvider(): EmailProvider | null {
  const raw = (process.env.EMAIL_PROVIDER ?? '').trim().toLowerCase();
  if (raw === '') return null;

  if (raw === 'resend' || raw === 'smtp' || raw === 'development') return raw;

  // 'log' is accepted as a synonym: it is what the transport is called.
  if (raw === 'log') return 'development';

  console.error(
    `[EMAIL] EMAIL_PROVIDER="${raw}" is not recognised and is being ignored. ` +
      'Use resend, smtp or development.',
  );
  return null;
}

/**
 * The development mail mode: write the message to the server log instead of
 * sending it, so the verification flow can be walked before a provider
 * exists.
 *
 * Two conditions, both required:
 *
 *   1. EMAIL_VERIFICATION_MODE=development — an explicit opt-in. It is never
 *      inferred from the absence of a provider, because "no provider
 *      configured" must fail loudly rather than quietly pretend to send.
 *
 *   2. NODE_ENV is not production — and this one is not overridable. A
 *      verification code in a production log is a credential sitting in a
 *      place far more people can read than the mailbox it was meant for.
 *      Production requires a real provider, full stop.
 *
 * If it is asked for in production it is refused, loudly, rather than
 * silently ignored — otherwise an operator would think it was on.
 */
export function developmentMailMode(): boolean {
  const asked =
    configuredProvider() === 'development' ||
    (process.env.EMAIL_VERIFICATION_MODE ?? '').trim().toLowerCase() === 'development';
  if (!asked) return false;

  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[TDMS] EMAIL_VERIFICATION_MODE=development is IGNORED because NODE_ENV=production. ' +
        'Verification codes will not be written to the log. Configure a real mail provider.',
    );
    return false;
  }

  return true;
}

export function activeTransport(): MailTransport {
  // Checked first, so a developer can force it even with a provider present.
  if (developmentMailMode()) return 'log';

  const asked = configuredProvider();

  if (asked === 'resend') return process.env.RESEND_API_KEY ? 'resend' : 'none';
  if (asked === 'smtp') return smtpConfigured() ? 'smtp' : 'none';

  /*
   * No explicit choice. Resend first — a leftover MAIL_HOST must not be able
   * to take over delivery from a working API key. See the note at the top.
   */
  if (process.env.RESEND_API_KEY) return 'resend';

  /*
   * SMTP only if it could actually work. A loopback host on a deployment is
   * not a transport, it is a mistake; falling through to `none` reports that
   * mail is unconfigured, which is both true and actionable, instead of
   * attempting a connection to the function's own sandbox.
   */
  if (smtpConfigured()) {
    if (isLoopbackHost(process.env.MAIL_HOST!) && isDeployedRuntime()) return 'none';
    return 'smtp';
  }

  return 'none';
}

/**
 * The From header, assembled from configuration and never hard-coded.
 *
 * EMAIL_FROM is the documented variable and is already a complete header:
 *
 *   EMAIL_FROM="TDMS <no-reply@yourdomain.com>"
 *
 * The older MAIL_FROM_ADDRESS + MAIL_FROM_NAME pair, and the pre-composed
 * MAIL_FROM, are still read in that order so an existing deployment does not
 * lose its sender when only EMAIL_FROM is added.
 *
 * Whichever is used, the address has to be one the provider will send for.
 * With Resend that means a verified domain — an arbitrary address is rejected
 * with a 403, which surfaces as EMAIL_SENDER_NOT_VERIFIED.
 */
export function mailFromAddress(): string {
  const composed = process.env.EMAIL_FROM?.trim();
  if (composed) return composed;

  const address = process.env.MAIL_FROM_ADDRESS;
  if (address) {
    const name = process.env.MAIL_FROM_NAME;
    return name ? `${name} <${address}>` : address;
  }

  return process.env.MAIL_FROM ?? '';
}

/**
 * True when real delivery is possible. Used to gate self-service flows.
 *
 * Derived from mailConfigurationProblem() rather than repeating its
 * conditions, so the two can never disagree — a gate that says "yes" while
 * the diagnostic says "misconfigured" is how a doomed send gets attempted.
 */
export function canSendMail(): boolean {
  return mailConfigurationProblem() === null;
}

/**
 * What an administrator needs to fix, with no secrets in it.
 *
 * Returned to the browser only on the setup screen, where the person reading
 * it is the operator installing the system. It names environment variables,
 * never their values.
 */
/**
 * True when this process is running on a deployment platform rather than a
 * developer's machine.
 *
 * VERCEL is set by the platform itself. NODE_ENV is consulted too so a
 * self-hosted production build is covered.
 */
function isDeployedRuntime(): boolean {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
}

/**
 * Hosts that only mean anything on the machine running the code.
 *
 * A local mail catcher such as Mailpit on 127.0.0.1:1025 is perfectly valid
 * in development, so this is only a fault when deployed — on a serverless
 * function, loopback is the function's own sandbox, where nothing is
 * listening, and every send fails with a connection error that looks like a
 * network problem rather than the configuration mistake it is.
 */
function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return (
    h === 'localhost' ||
    h === '::1' ||
    h === '[::1]' ||
    h === '0.0.0.0' ||
    /^127\./.test(h)
  );
}

/** True when MAIL_HOST names this machine on a deployment, where it cannot work. */
function loopbackWhenDeployed(): boolean {
  const host = process.env.MAIL_HOST;
  return Boolean(host && isLoopbackHost(host) && isDeployedRuntime());
}

const NOT_CONFIGURED =
  'Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM in the server ' +
  'environment — on Vercel, in Project Settings → Environment Variables, for the ' +
  'environment you are testing, then redeploy. An institutional SMTP server can be used ' +
  'instead with EMAIL_PROVIDER=smtp plus MAIL_HOST and MAIL_PORT. For local development ' +
  'only, EMAIL_PROVIDER=development writes the code to the server log.';

function loopbackProblem(): string {
  const host = (process.env.MAIL_HOST ?? '').trim();
  return (
    `MAIL_HOST is set to a loopback address (${host}), which cannot work in a deployed ` +
    'environment — it refers to the server itself, where no mail server is running. Set ' +
    'RESEND_API_KEY and EMAIL_FROM and remove MAIL_HOST from this environment. A loopback ' +
    'address is only valid for a local mail catcher during development.'
  );
}

export function mailConfigurationProblem(): string | null {
  const transport = activeTransport();

  if (transport === 'none') {
    /*
     * Name the actual mistake when there is one. Told only that email is
     * "not configured", an operator looking at an environment that plainly
     * contains MAIL_HOST would have no reason to suspect the value.
     */
    return loopbackWhenDeployed() ? loopbackProblem() : NOT_CONFIGURED;
  }

  // The log transport has no recipient to satisfy, so no From is required.
  if (transport !== 'log' && mailFromAddress() === '') {
    return (
      'Email delivery is not configured: no sender address. Set EMAIL_FROM in the server ' +
      'environment, for example EMAIL_FROM="TDMS <no-reply@yourdomain.com>", using a ' +
      'sender the provider is verified to send for.'
    );
  }

  /*
   * SMTP asked for explicitly, pointed at loopback, on a deployment. Caught
   * here rather than left to fail at connect time: attempting it produces a
   * bare connection error, which reads as "the network is broken" when in fact
   * the address can never work.
   */
  if (transport === 'smtp' && loopbackWhenDeployed()) return loopbackProblem();

  return null;
}

/**
 * A configuration oddity that is not fatal, for the health endpoint.
 *
 * The case this exists for is the one that caused the outage: a deployment
 * carrying `MAIL_HOST=127.0.0.1` from an earlier local setup. Now that Resend
 * takes precedence, that value is inert — but it is still wrong, still
 * confusing to the next person who reads the environment, and worth saying so
 * somewhere visible rather than silently ignoring.
 */
export function mailConfigurationWarning(): string | null {
  if (activeTransport() === 'resend' && loopbackWhenDeployed()) {
    return (
      `MAIL_HOST is set to a loopback address (${(process.env.MAIL_HOST ?? '').trim()}) and is ` +
      'being IGNORED: mail is going through Resend. Remove MAIL_HOST from this environment ' +
      'to avoid confusion.'
    );
  }

  if (activeTransport() === 'log') {
    return 'Development mail mode is on: verification codes are written to the server log and no email is sent.';
  }

  return null;
}

/**
 * The SMTP connection, built once per serverless instance.
 *
 * Reused across invocations on a warm instance so a burst of mail does not
 * open a connection per message; nodemailer pools and reconnects on its own.
 * Held in a module-level variable rather than a global, and rebuilt if the
 * configuration changes under it.
 */
let cached: { key: string; transporter: Transporter } | null = null;

function smtpTransporter(): Transporter {
  const host = process.env.MAIL_HOST!;
  const port = Number(process.env.MAIL_PORT);
  const user = process.env.MAIL_USERNAME;
  const pass = process.env.MAIL_PASSWORD;

  /*
   * Implicit TLS on 465, STARTTLS on everything else. MAIL_ENCRYPTION
   * overrides when a server wants something unusual, but the default is
   * derived so a correct port alone gives a correct, encrypted connection.
   */
  const encryption = (process.env.MAIL_ENCRYPTION ?? '').toLowerCase();
  const secure = encryption ? encryption === 'ssl' || encryption === 'tls' : port === 465;

  // Identifies the configuration, not its contents: no secret in this string.
  const key = `${host}:${port}:${secure}:${user ? 'auth' : 'anon'}`;
  if (cached?.key === key) return cached.transporter;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    /*
     * STARTTLS is required, not merely offered: without this a server that
     * quietly omits STARTTLS would get the credentials in the clear.
     */
    requireTLS: !secure,
    ...(user && pass ? { auth: { user, pass } } : {}),
    pool: true,
    maxConnections: 2,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  cached = { key, transporter };
  return transporter;
}

async function sendViaSmtp(message: MailMessage): Promise<MailResult> {
  await smtpTransporter().sendMail({
    from: mailFromAddress(),
    to: message.to,
    subject: message.subject,
    text: message.text,
  });

  logEmail('SENT', 'SMTP', 'accepted by the mail server');
  return { delivered: true, transport: 'smtp' };
}

/**
 * Strip full email addresses out of text bound for a log line.
 *
 * Resend quotes the recipient in some refusals — "you can only send testing
 * emails to your own address (someone@example.com)" — and a verification
 * recipient does not belong in a log. Domains are left intact: `example.com is
 * not verified` is exactly the sentence an operator needs, and a domain is not
 * a secret.
 */
export function redactAddresses(text: string): string {
  return text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[address]');
}

/**
 * Turn a Resend error body into a stable code.
 *
 * Both the status and the body's `name` are consulted, because the statuses
 * overlap: a missing key and an unverified sender are both 403, and they have
 * completely different fixes.
 */
function classifyResendError(status: number, name: string, text: string): MailErrorCode {
  const lower = `${name} ${text}`.toLowerCase();

  if (/api[_ -]?key/.test(lower)) return 'EMAIL_AUTH_FAILED';
  if (status === 401) return 'EMAIL_AUTH_FAILED';

  /*
   * The two sender problems, which look different but read the same to an
   * operator: the domain is not verified, or the account is still in Resend's
   * testing mode, where only the account owner's own address may be written to.
   */
  if (/not verified|verify a domain|domain is not|testing emails|own email address/.test(lower)) {
    return 'EMAIL_SENDER_NOT_VERIFIED';
  }

  if (status === 403 || status === 422) return 'EMAIL_SENDER_NOT_VERIFIED';
  if (status === 429 || /rate.?limit/.test(lower)) return 'EMAIL_PROVIDER_REJECTED';
  if (status >= 500) return 'EMAIL_PROVIDER_REJECTED';

  return 'EMAIL_PROVIDER_REJECTED';
}

/**
 * Send through Resend's HTTP API.
 *
 * The API rather than the SDK: this is one POST with a JSON body, the SDK
 * wraps exactly that, and a serverless function is a place to be frugal about
 * what gets bundled. The key travels in an Authorization header, from
 * process.env, in a `server-only` module — it is never referenced from client
 * code and never appears in a log line or a response.
 */
async function sendViaResend(message: MailMessage): Promise<MailResult> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: mailFromAddress(),
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });

  /*
   * The body is read on both paths. On failure it carries the only statement
   * of what actually went wrong — without it, every refusal from 403 to 429
   * looks the same from the server log, which is the position this system was
   * in. On success it carries the message id, which is what makes a delivery
   * traceable in the Resend dashboard afterwards.
   */
  const body = (await response.json().catch(() => null)) as {
    id?: string;
    name?: string;
    message?: string;
  } | null;

  if (!response.ok) {
    const name = body?.name ?? '';
    const reason = redactAddresses(body?.message ?? `HTTP ${response.status}`);
    const code = classifyResendError(response.status, name, body?.message ?? '');

    logEmail('FAILED', 'Resend', reason, {
      status: response.status,
      providerError: name || null,
      code,
    });

    return { delivered: false, transport: 'resend', code, detail: MAIL_ERROR_REMEDY[code] };
  }

  logEmail('SENT', 'Resend', 'accepted for delivery', { messageId: body?.id ?? null });
  return { delivered: true, transport: 'resend' };
}

/**
 * Development only: write the message to the server log instead of sending.
 *
 * This is the ONE place in the codebase that deliberately prints a
 * verification code. It is reachable only when EMAIL_VERIFICATION_MODE is
 * development AND NODE_ENV is not production (see developmentMailMode), and
 * it announces itself in block capitals so a log reader cannot mistake it
 * for normal operation.
 */
function sendViaLog(message: MailMessage): MailResult {
  console.warn(
    [
      '',
      '='.repeat(72),
      'DEV EMAIL — NOT SENT. EMAIL_VERIFICATION_MODE=development.',
      'This block prints a verification code and is disabled in production.',
      '='.repeat(72),
      `To:      ${message.to}`,
      `Subject: ${message.subject}`,
      '-'.repeat(72),
      message.text,
      '='.repeat(72),
      '',
    ].join('\n'),
  );

  logEmail('SENT', 'development log', 'written to the server log; no email was sent');

  return {
    delivered: true,
    transport: 'log',
    detail: 'Written to the server log (development mode) — no email was sent.',
  };
}

/**
 * Send, or report honestly that nothing was sent.
 *
 * The technical reason is logged server-side; the caller gets a short, safe
 * sentence. Nothing that could identify a mailbox or a credential crosses
 * back, and the message body — which may carry a verification code — is
 * never logged by any path through this function.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const transport = activeTransport();

  const problem = mailConfigurationProblem();
  if (problem) {
    logEmail('SKIPPED', providerLabel(transport), problem);
    return {
      delivered: false,
      transport,
      detail: problem,
      code: 'EMAIL_SERVICE_NOT_CONFIGURED',
    };
  }

  try {
    if (transport === 'log') return sendViaLog(message);
    return transport === 'smtp' ? await sendViaSmtp(message) : await sendViaResend(message);
  } catch (error) {
    /*
     * Logged in full on the server — an SMTP failure is usually a
     * configuration mistake and the operator needs the detail. nodemailer's
     * errors carry the host and response code, not the password.
     */
    const code = classifySmtpError(error);

    /*
     * The provider's own words, on the server only. An SMTP failure is nearly
     * always a configuration mistake and the operator needs the specifics;
     * nodemailer's message carries the host and the server's response, never
     * the password. Addresses are redacted anyway, and the message body — which
     * holds the verification code — is not passed in here at all.
     *
     * A fetch failure on the Resend path lands here too, which is how a DNS or
     * egress problem gets named rather than reported as "couldn't send".
     */
    const reason = redactAddresses(error instanceof Error ? error.message : 'unknown error');

    logEmail('FAILED', providerLabel(transport), reason, {
      code,
      smtpCode: (error as { code?: unknown })?.code ?? null,
      responseCode: (error as { responseCode?: unknown })?.responseCode ?? null,
    });

    return { delivered: false, transport, code, detail: MAIL_ERROR_REMEDY[code] };
  }
}

/**
 * Absolute base URL for links in emails.
 *
 * A link must never be built from a request header: `Host` is attacker
 * controlled, and a poisoned value would send verification links to someone
 * else's domain. This is configuration only.
 */
export function appUrl(): string {
  const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, '');

  // Vercel supplies this for the production deployment.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}
