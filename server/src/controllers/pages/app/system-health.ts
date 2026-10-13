import { requireUser, authorizePage } from '@/server/auth/current-user';
import { systemPolicy } from '@/server/auth/policies';
import { prisma } from '@/server/lib/prisma';
import { activeTransport, canSendMail, mailConfigurationProblem, appUrl } from '@/server/mail/mailer';
import { describeDomainPolicy } from '@/server/lib/institutional-email';
import { googleConfigured } from '@/server/auth/google/oauth';
import { describeStaticCodePolicy } from '@/server/auth/super-admin-code';
import { describeVault } from '@/server/auth/credential-vault';
import { accessCodeTtlMinutes, accessCodeMaxAttempts } from '@/server/auth/admin-access-code';
import type { PageRequest } from '@/server/controllers/pages/types';

export type Tone = 'ok' | 'warn' | 'bad';

/**
 * /system-health — whether each part of TDMS is configured and reachable.
 * Secrets are reported as set or not set, never shown; every value here is
 * computed on the server.
 */
export async function loadSystemHealth(_request: PageRequest) {
  const user = await requireUser();
  authorizePage(systemPolicy.viewSystemHealth(user));

  let dbTone: Tone = 'bad';
  let dbValue = 'Unreachable';
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTone = 'ok';
    dbValue = `Connected · ${Date.now() - started} ms`;
  } catch (error) {
    console.error('[TDMS] System Health: database unreachable.', error);
  }

  const [activeUsers, suspendedUsers, activeCodes] =
    dbTone === 'ok'
      ? await Promise.all([
          prisma.user.count({ where: { status: 'ACTIVE' } }),
          prisma.user.count({ where: { status: 'SUSPENDED' } }),
          prisma.adminAccessCode.count({ where: { usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
        ])
      : [null, null, null];

  const production = process.env.NODE_ENV === 'production';
  const url = appUrl();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.GIT_COMMIT?.slice(0, 7) ?? null;
  const region = process.env.VERCEL_REGION ?? null;
  const mailProblem = mailConfigurationProblem();
  const domain = describeDomainPolicy();
  const staticCode = describeStaticCodePolicy();
  const vault = describeVault();
  const sending = canSendMail();

  return {
    dbTone,
    dbValue,
    appUrl: url,
    appUrlWarning: url.includes('localhost') && production,
    deployment: [commit && `commit ${commit}`, region && `region ${region}`].filter(Boolean).join(' · ') || 'Local',
    activeUsers,
    suspendedUsers,
    activeCodes,
    staticCode,
    vault,
    accessCodes: `Expire after ${accessCodeTtlMinutes()} minutes · ${accessCodeMaxAttempts()} attempts`,
    domainTone: (domain.enabled || !production ? 'ok' : 'warn') as Tone,
    domainSummary: domain.summary,
    google: googleConfigured(),
    mailTone: (sending ? (mailProblem ? 'warn' : 'ok') : 'bad') as Tone,
    mailValue: sending ? `Via ${activeTransport()}` : 'Cannot send',
    mailProblem,
  };
}
