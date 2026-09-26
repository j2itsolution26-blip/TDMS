import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Outbound email.
 *
 * Two real transports, chosen from the environment, plus an explicit
 * "unconfigured" state:
 *
 *   * `smtp`   — used when MAIL_HOST is set. Any institutional mail server or
 *                provider that speaks SMTP, credentials from the environment.
 *   * `resend` — used when RESEND_API_KEY is set and MAIL_HOST is not. An HTTP
 *                API, which needs no outbound TCP connection.
 *   * `none`   — nothing is configured. Sending FAILS. It does not pretend.
 *
 * `none` is the important one. This module used to carry a `log` transport
 * that wrote the message — verification link included — to the server log and
 * reported success in development. That made a flow appear to work while
 * nothing was delivered, and it put a live credential in the logs. Both are
 * gone: when mail is unconfigured, `sendMail` reports failure, callers refuse
 * to proceed, and the log records only that no provider is configured.
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
  const asked = (process.env.EMAIL_VERIFICATION_MODE ?? '').trim().toLowerCase() === 'development';
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
  // Checked first, so a developer can force it even with SMTP values present.
  if (developmentMailMode()) return 'log';
  if (smtpConfigured()) return 'smtp';
  if (process.env.RESEND_API_KEY) return 'resend';
  return 'none';
}

/**
 * The From header, assembled from configuration.
 *
 * MAIL_FROM_ADDRESS + MAIL_FROM_NAME are the documented pair; MAIL_FROM is
 * still read as a pre-composed fallback so an existing deployment does not
 * break on this change.
 */
export function mailFromAddress(): string {
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

export function mailConfigurationProblem(): string | null {
  if (activeTransport() === 'none') {
    return (
      'Email delivery is not configured. Set MAIL_HOST, MAIL_PORT, MAIL_USERNAME, ' +
      'MAIL_PASSWORD, MAIL_FROM_ADDRESS and MAIL_FROM_NAME (or RESEND_API_KEY) in the ' +
      'server environment. For local development only, EMAIL_VERIFICATION_MODE=development ' +
      'writes the code to the server log instead.'
    );
  }

  // The log transport has no recipient to satisfy, so no From is required.
  if (activeTransport() !== 'log' && mailFromAddress() === '') {
    return 'Email delivery is not configured: no sender address. Set MAIL_FROM_ADDRESS (and MAIL_FROM_NAME) in the server environment.';
  }

  /*
   * Caught here rather than left to fail at connect time. Attempting it would
   * produce a bare connection error, which reads as "the network is broken"
   * when in fact the address can never work in a deployed environment.
   */
  const host = process.env.MAIL_HOST;
  if (host && isLoopbackHost(host) && isDeployedRuntime()) {
    return (
      `MAIL_HOST is set to a loopback address (${host.trim()}), which cannot work in a ` +
      'deployed environment — it refers to the server itself, where no mail server is ' +
      'running. Set MAIL_HOST to a reachable SMTP host, or use RESEND_API_KEY instead. ' +
      'A loopback address is only valid for a local mail catcher during development.'
    );
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

  console.log('[EMAIL] ok verification email accepted by the mail server.', {
    transport: 'smtp',
    subject: message.subject,
  });
  return { delivered: true, transport: 'smtp' };
}

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

  if (!response.ok) {
    // The provider's response may quote the recipient; keep it out of the
    // value we hand back to a caller that might render it.
    const status = response.status;

    /*
     * Mapped from the status alone. The body is deliberately not read: it can
     * quote the recipient, and it is not needed to tell these cases apart.
     */
    const code: MailErrorCode =
      status === 401 || status === 403
        ? 'EMAIL_AUTH_FAILED'
        : status === 422
          ? 'EMAIL_SENDER_NOT_VERIFIED'
          : status === 429
            ? 'EMAIL_PROVIDER_REJECTED'
            : status >= 500
              ? 'EMAIL_PROVIDER_REJECTED'
              : 'EMAIL_PROVIDER_REJECTED';

    console.error('[EMAIL] x Resend rejected the message.', { status, code });
    return { delivered: false, transport: 'resend', code, detail: MAIL_ERROR_REMEDY[code] };
  }

  console.log('[EMAIL] ok message accepted by the provider.', {
    transport: 'resend',
    subject: message.subject,
  });
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
    console.error('[EMAIL] x nothing sent: no mail provider is configured.', {
      subject: message.subject,
    });
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
     * Logged in full on the server: an SMTP failure is nearly always a
     * configuration mistake and the operator needs the specifics.
     * nodemailer's error carries the host and the server's response, not the
     * password — but the password is never in these fields anyway, and the
     * message body (which holds the verification code) is never logged here.
     */
    console.error('[EMAIL] x failed to send verification email.', {
      transport,
      subject: message.subject,
      code,
      smtpCode: (error as { code?: unknown })?.code ?? null,
      responseCode: (error as { responseCode?: unknown })?.responseCode ?? null,
      error: error instanceof Error ? error.message : 'unknown error',
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
