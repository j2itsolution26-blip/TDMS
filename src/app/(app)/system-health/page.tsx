import { requireUser, authorizePage } from '@/server/auth/current-user';
import { systemPolicy } from '@/server/auth/policies';
import { prisma } from '@/lib/prisma';
import { Card, PageHeader, Badge } from '@/components/ui';
import { activeTransport, canSendMail, mailConfigurationProblem, appUrl } from '@/server/mail/mailer';
import { describeDomainPolicy } from '@/lib/institutional-email';
import { googleConfigured } from '@/server/auth/google/oauth';
import { describeStaticCodePolicy } from '@/server/auth/super-admin-code';
import { describeVault } from '@/server/auth/credential-vault';
import { accessCodeTtlMinutes, accessCodeMaxAttempts } from '@/server/auth/admin-access-code';

/**
 * Super Admin → System Health. Read-only.
 *
 * The same facts /api/health reports, drawn with the same helpers, for someone
 * who is signed in rather than reading JSON. Like that endpoint it states only
 * whether each secret is configured — never a value, a length or a prefix.
 *
 * It does not replace /api/health: that endpoint answers without a session,
 * which is exactly when it is needed (nobody can sign in). This page is for
 * the everyday "is everything set up?" question.
 */
export const dynamic = 'force-dynamic';

type Tone = 'ok' | 'warn' | 'bad';

const BADGE: Record<Tone, { status: string; label: string }> = {
  ok: { status: 'active', label: 'OK' },
  warn: { status: 'pending', label: 'Attention' },
  bad: { status: 'rejected', label: 'Problem' },
};

function Row({ label, tone, value, hint }: { label: string; tone: Tone; value: string; hint?: string | null }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-0 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-sm font-medium text-navy-900">{label}</p>
        <p className="text-sm text-slate-500">{value}</p>
        {hint && <p className="mt-1 text-xs text-amber-700">{hint}</p>}
      </div>
      <Badge status={BADGE[tone].status} label={BADGE[tone].label} />
    </div>
  );
}

export default async function SystemHealthPage() {
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

  const mailProblem = mailConfigurationProblem();
  const domain = describeDomainPolicy();
  const staticCode = describeStaticCodePolicy();
  const vault = describeVault();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  const region = process.env.VERCEL_REGION ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health"
        subtitle="Whether each part of TDMS is configured and reachable. Secrets are reported as set or not set, never shown."
      />

      <Card>
        <h2 className="text-base font-semibold text-navy-900">Platform</h2>
        <Row label="Database" tone={dbTone} value={dbValue} />
        <Row
          label="Application URL"
          tone={appUrl().includes('localhost') && process.env.NODE_ENV === 'production' ? 'warn' : 'ok'}
          value={appUrl()}
          hint={appUrl().includes('localhost') && process.env.NODE_ENV === 'production' ? 'APP_URL points at localhost on a deployed site; emailed links will not work.' : null}
        />
        <Row label="Deployment" tone="ok" value={[commit && `commit ${commit}`, region && `region ${region}`].filter(Boolean).join(' · ') || 'Local'} />
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-navy-900">Accounts</h2>
        <Row label="Active accounts" tone="ok" value={activeUsers === null ? '—' : String(activeUsers)} />
        <Row label="Suspended accounts" tone="ok" value={suspendedUsers === null ? '—' : String(suspendedUsers)} />
        <Row label="Live Admin access codes" tone="ok" value={activeCodes === null ? '—' : String(activeCodes)} />
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-navy-900">Security</h2>
        <Row
          label="Super Admin security code"
          tone={staticCode.configured ? 'ok' : 'warn'}
          value={staticCode.configured ? 'Configured' : 'Not configured'}
          hint={staticCode.configured ? null : `Set ${staticCode.variable} in the server environment.`}
        />
        <Row
          label="Temporary password reveal"
          tone={vault.configured ? 'ok' : 'warn'}
          value={vault.configured ? 'Configured' : 'Not configured — temporary passwords are shown once only'}
          hint={vault.configured ? null : `Set ${vault.variable} (openssl rand -base64 32).`}
        />
        <Row label="Admin access codes" tone="ok" value={`Expire after ${accessCodeTtlMinutes()} minutes · ${accessCodeMaxAttempts()} attempts`} />
        <Row
          label="Email domain policy"
          tone={domain.enabled || process.env.NODE_ENV !== 'production' ? 'ok' : 'warn'}
          value={domain.summary}
        />
        <Row label="Google sign-in" tone={googleConfigured() ? 'ok' : 'warn'} value={googleConfigured() ? 'Configured' : 'Not configured'} />
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-navy-900">Email</h2>
        <Row
          label="Mail delivery"
          tone={canSendMail() ? (mailProblem ? 'warn' : 'ok') : 'bad'}
          value={canSendMail() ? `Via ${activeTransport()}` : 'Cannot send'}
          hint={mailProblem}
        />
        <p className="pt-3 text-xs text-slate-500">
          Account creation and password resets do not depend on email. It is used for access-code
          emails, &quot;Forgot password&quot; links and code requests.
        </p>
      </Card>

      <p className="text-xs text-slate-500">
        The same checks are available without signing in at <code>/api/health</code>, for when nobody
        can sign in.
      </p>
    </div>
  );
}
