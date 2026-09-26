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

export type MailTransport = 'smtp' | 'resend' | 'none';

export interface MailResult {
  delivered: boolean;
  transport: MailTransport;
  /**
   * Safe to show an administrator. Never contains the message body, a
   * credential, a recipient, or a provider's raw error text.
   */
  detail?: string;
}

/** True when every value SMTP needs is present. */
function smtpConfigured(): boolean {
  return Boolean(process.env.MAIL_HOST && process.env.MAIL_PORT);
}

export function activeTransport(): MailTransport {
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

/** True when real delivery is possible. Used to gate self-service flows. */
export function canSendMail(): boolean {
  return activeTransport() !== 'none' && mailFromAddress() !== '';
}

/**
 * What an administrator needs to fix, with no secrets in it.
 *
 * Returned to the browser only on the setup screen, where the person reading
 * it is the operator installing the system. It names environment variables,
 * never their values.
 */
export function mailConfigurationProblem(): string | null {
  if (activeTransport() === 'none') {
    return 'Email delivery is not configured. Set MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM_ADDRESS and MAIL_FROM_NAME (or RESEND_API_KEY) in the server environment.';
  }

  if (mailFromAddress() === '') {
    return 'Email delivery is not configured: no sender address. Set MAIL_FROM_ADDRESS (and MAIL_FROM_NAME) in the server environment.';
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
    console.error('[TDMS] Resend rejected a message.', { status });
    return { delivered: false, transport: 'resend', detail: `Mail provider returned ${status}.` };
  }

  return { delivered: true, transport: 'resend' };
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
    console.error('[TDMS] Mail not sent: no mail provider is configured.', {
      subject: message.subject,
    });
    return { delivered: false, transport, detail: problem };
  }

  try {
    return transport === 'smtp' ? await sendViaSmtp(message) : await sendViaResend(message);
  } catch (error) {
    /*
     * Logged in full on the server — an SMTP failure is usually a
     * configuration mistake and the operator needs the detail. nodemailer's
     * errors carry the host and response code, not the password.
     */
    console.error('[TDMS] Sending mail failed.', {
      transport,
      subject: message.subject,
      error: error instanceof Error ? error.message : 'unknown error',
    });

    return {
      delivered: false,
      transport,
      detail: 'The mail server could not be reached, or refused the message.',
    };
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
