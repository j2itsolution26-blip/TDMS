import 'server-only';

/**
 * Outbound email.
 *
 * Laravel's MAIL_MAILER was `log`, so this system has never actually sent
 * anything. Rather than pick a provider on your behalf, this is a small
 * transport interface with two implementations:
 *
 *   * `resend`  — used when RESEND_API_KEY is set. HTTP API, no SMTP, works
 *                 on serverless without a persistent connection.
 *   * `log`     — the fallback. Writes the message to the server log,
 *                 including the verification URL, so the flow is fully
 *                 exercisable in development before any provider exists.
 *
 * The `log` transport is a development aid and says so loudly. In production
 * it is treated as a failure: `sendMail` reports that delivery did not
 * happen, and callers surface that rather than telling a user to check an
 * inbox that will stay empty.
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text. Deliberately not HTML: nothing here needs markup. */
  text: string;
}

export type MailTransport = 'resend' | 'log';

export interface MailResult {
  delivered: boolean;
  transport: MailTransport;
  /** Safe to show an administrator; never contains the message body. */
  detail?: string;
}

export function activeTransport(): MailTransport {
  return process.env.RESEND_API_KEY ? 'resend' : 'log';
}

export function mailFromAddress(): string {
  return process.env.MAIL_FROM ?? 'TDMS <no-reply@asiancollege.edu.ph>';
}

/** True when real delivery is possible. Used to gate self-service flows. */
export function canSendMail(): boolean {
  return activeTransport() !== 'log';
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

function sendViaLog(message: MailMessage): MailResult {
  const production = process.env.NODE_ENV === 'production';

  console.warn(
    [
      '',
      '='.repeat(72),
      production
        ? 'TDMS MAIL NOT SENT — no mail provider configured (set RESEND_API_KEY)'
        : 'TDMS MAIL (development log transport — nothing was actually sent)',
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
    // In development this counts as delivered, because the developer can read
    // the link in the console. In production it does not, because nobody can.
    delivered: !production,
    transport: 'log',
    detail: production
      ? 'No mail provider is configured, so the message could not be sent.'
      : 'Written to the server log (development).',
  };
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  try {
    return activeTransport() === 'resend' ? await sendViaResend(message) : sendViaLog(message);
  } catch (error) {
    console.error('[TDMS] Sending mail threw.', error);
    return { delivered: false, transport: activeTransport(), detail: 'Could not send the message.' };
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
