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

/**
 * The one-time access code for an Admin account.
 *
 * WHAT THIS DELIBERATELY DOES NOT CONTAIN
 *
 *   * the temporary password. It is shown once to the Super Admin, who hands
 *     it over by another route. Putting both halves in one mailbox would
 *     make that mailbox a complete set of credentials, which is the thing
 *     splitting them in two was for.
 *   * the static Super Admin security code. That never leaves the server
 *     environment under any circumstances.
 *   * any link. There is nothing to click, so nothing for a mail scanner to
 *     fetch and quietly consume.
 */
export async function sendAdminAccessCodeEmail(params: {
  to: string;
  name: string;
  code: string;
  expiresAt: Date;
}): Promise<MailResult> {
  const minutes = Math.max(1, Math.round((params.expiresAt.getTime() - Date.now()) / 60_000));

  return sendMail({
    to: params.to,
    subject: 'Your TDMS administrator access code',
    text: [
      `Hello ${params.name},`,
      '',
      'Your administrator access code for TDMS, the TVET Diploma Management',
      'System at Asian College of Science and Technology, is:',
      '',
      params.code,
      '',
      `It expires in ${minutes} minute${minutes === 1 ? '' : 's'} and works once.`,
      '',
      'Sign in with your email address and the temporary password you were',
      'given, then enter this code when asked. You will be asked to choose a',
      'permanent password straight afterwards — please do that immediately,',
      'and do not reuse the temporary one anywhere.',
      '',
      'If you did not expect this, tell the system administrator. The code',
      'can be cancelled and reissued.',
      '',
      'TDMS · Asian College of Science and Technology',
    ].join('\n'),
  });
}

/**
 * An Admin whose code has expired, asking the Super Admin for another.
 *
 * This message is the ONLY thing the "Request new code" button does. It
 * cannot issue a code: an account that could mint its own access code has a
 * one-factor sign-in with extra steps.
 */
export async function sendAccessCodeRequestEmail(params: {
  to: string;
  superAdminName: string;
  adminName: string;
  adminEmail: string;
}): Promise<MailResult> {
  return sendMail({
    to: params.to,
    subject: 'TDMS: an administrator needs a new access code',
    text: [
      `Hello ${params.superAdminName},`,
      '',
      `${params.adminName} <${params.adminEmail}> has signed in with their`,
      'password and needs an access code to finish.',
      '',
      'Issue one from the Super Admin Dashboard → Admin Access Codes →',
      'Generate Access Code, then pass it to them. Any previous unused code',
      'is revoked automatically when a new one is issued.',
      '',
      'No code is included in this message, and none has been created by this',
      'request.',
      '',
      'TDMS · Asian College of Science and Technology',
    ].join('\n'),
  });
}
