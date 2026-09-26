import 'server-only';
import { appUrl, sendMail, type MailResult } from './mailer';

/**
 * The messages TDMS sends. Plain text, short, and naming the institution so
 * a recipient can tell them from phishing.
 *
 * No message ever contains a password, a hash, or anything beyond the
 * single-use token it exists to deliver.
 */

export function verificationUrl(token: string): string {
  return `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function passwordResetUrl(token: string): string {
  return `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail(params: {
  to: string;
  name: string;
  token: string;
  expiresAt: Date;
}): Promise<MailResult> {
  const hours = Math.max(1, Math.round((params.expiresAt.getTime() - Date.now()) / 3_600_000));

  return sendMail({
    to: params.to,
    subject: 'Verify your TDMS account',
    text: [
      `Hello ${params.name},`,
      '',
      'An account has been created for you on TDMS, the TVET Diploma',
      'Management System at Asian College of Science and Technology.',
      '',
      'Confirm this email address to activate your account:',
      '',
      verificationUrl(params.token),
      '',
      `This link expires in ${hours} hour${hours === 1 ? '' : 's'} and can be used once.`,
      '',
      'If you were not expecting this, you can ignore it — the account cannot',
      'be used until the link above is opened.',
      '',
      'TDMS · Asian College of Science and Technology',
    ].join('\n'),
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  token: string;
  expiresAt: Date;
}): Promise<MailResult> {
  const minutes = Math.max(1, Math.round((params.expiresAt.getTime() - Date.now()) / 60_000));

  return sendMail({
    to: params.to,
    subject: 'Reset your TDMS password',
    text: [
      `Hello ${params.name},`,
      '',
      'Someone asked to reset the password for your TDMS account.',
      '',
      'Choose a new password here:',
      '',
      passwordResetUrl(params.token),
      '',
      `This link expires in ${minutes} minute${minutes === 1 ? '' : 's'} and can be used once.`,
      '',
      'If this was not you, no action is needed. Your current password still',
      'works and this link can be ignored.',
      '',
      'TDMS · Asian College of Science and Technology',
    ].join('\n'),
  });
}
