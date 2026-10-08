import { Card, PageHeader, Badge } from '@/components/ui';
import { Page } from '@/lib/page-data';
import type { loadSystemHealth, Tone } from '@/server/controllers/pages/app/system-health';

type Data = Awaited<ReturnType<typeof loadSystemHealth>>;

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

function View(d: Data) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health"
        subtitle="Whether each part of TDMS is configured and reachable. Secrets are reported as set or not set, never shown."
      />

      <Card>
        <h2 className="text-base font-semibold text-navy-900">Platform</h2>
        <Row label="Database" tone={d.dbTone} value={d.dbValue} />
        <Row
          label="Application URL"
          tone={d.appUrlWarning ? 'warn' : 'ok'}
          value={d.appUrl}
          hint={d.appUrlWarning ? 'APP_URL points at localhost on a deployed site; emailed links will not work.' : null}
        />
        <Row label="Deployment" tone="ok" value={d.deployment} />
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-navy-900">Accounts</h2>
        <Row label="Active accounts" tone="ok" value={d.activeUsers === null ? '—' : String(d.activeUsers)} />
        <Row label="Suspended accounts" tone="ok" value={d.suspendedUsers === null ? '—' : String(d.suspendedUsers)} />
        <Row label="Live Admin access codes" tone="ok" value={d.activeCodes === null ? '—' : String(d.activeCodes)} />
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-navy-900">Security</h2>
        <Row
          label="Super Admin security code"
          tone={d.staticCode.configured ? 'ok' : 'warn'}
          value={d.staticCode.configured ? 'Configured' : 'Not configured'}
          hint={d.staticCode.configured ? null : `Set ${d.staticCode.variable} in the server environment.`}
        />
        <Row
          label="Temporary password reveal"
          tone={d.vault.configured ? 'ok' : 'warn'}
          value={d.vault.configured ? 'Configured' : 'Not configured — temporary passwords are shown once only'}
          hint={d.vault.configured ? null : `Set ${d.vault.variable} (openssl rand -base64 32).`}
        />
        <Row label="Admin access codes" tone="ok" value={d.accessCodes} />
        <Row label="Email domain policy" tone={d.domainTone} value={d.domainSummary} />
        <Row label="Google sign-in" tone={d.google ? 'ok' : 'warn'} value={d.google ? 'Configured' : 'Not configured'} />
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-navy-900">Email</h2>
        <Row label="Mail delivery" tone={d.mailTone} value={d.mailValue} hint={d.mailProblem} />
        <p className="pt-3 text-xs text-slate-500">
          Account creation and password resets do not depend on email. It is used for access-code
          emails, &quot;Forgot password&quot; links and code requests.
        </p>
      </Card>

      <p className="text-xs text-slate-500">
        The same checks are available without signing in at <code>/api/v1/health</code>, for when nobody
        can sign in.
      </p>
    </div>
  );
}

/** /system-health — Super Admin only. */
export default function SystemHealthPage() {
  return <Page<Data> endpoint="/system-health" render={(d) => <View {...d} />} />;
}
