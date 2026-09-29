import Link from 'next/link';
import type { ReactNode } from 'react';
import { Archive, ArrowLeft } from 'lucide-react';
import { StatusPill, TONE, FOCUS } from '@/components/dashboard/RoleDashboardParts';
import type { WorkTone } from '@/types/dashboard';

/**
 * The Diploma Instructor module's screen kit, on the TDMS green enterprise
 * design: white cards on the light page, one green accent, statuses as words
 * with a colour cue, tables that scroll inside themselves on a phone.
 *
 * No hooks here, so every part renders on the server and in client screens.
 */

export { StatusPill, TONE, FOCUS };

export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  back,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {back && (
            <Link href={back.href} className={`mb-2 inline-flex items-center gap-1.5 rounded-md text-[13px] font-semibold text-tdms-text hover:underline ${FOCUS}`}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {back.label}
            </Link>
          )}
          {eyebrow && <p className="text-[13px] font-semibold text-tdms-text">{eyebrow}</p>}
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-tdms-ink sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-[15px] text-tdms-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function Card({ title, description, actions, children, className = '', padded = true }: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-tdms-hairline bg-white shadow-card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold tracking-[-0.01em] text-tdms-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-tdms-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'px-5 pb-5 sm:px-6' : 'pb-2'}>{children}</div>
    </section>
  );
}

export function Empty({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-tdms-hairline bg-tdms-bg/50 px-4 py-10 text-center">
      <p className="text-sm font-semibold text-tdms-ink">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-[13px] text-tdms-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Read-only notice for an archived school year. */
export function ArchivedNote({ label }: { label: string }) {
  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-700">
      <Archive className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-semibold">School year {label} is archived.</span> Its records are read-only — you can view them but not change them.
      </span>
    </p>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: WorkTone }) {
  return (
    <div className="rounded-2xl border border-tdms-hairline bg-white p-4 shadow-card">
      <p className="text-[13px] font-semibold text-tdms-muted">{label}</p>
      <p className="mt-1.5 text-[26px] font-bold leading-none tracking-[-0.02em] text-tdms-ink tabular-nums">{value}</p>
      {hint && <p className={`mt-1.5 text-xs font-medium ${tone ? TONE[tone].text : 'text-tdms-muted'}`}>{hint}</p>}
    </div>
  );
}

// --- Tables ------------------------------------------------------------------------------

export const TH = 'whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.04em] text-tdms-muted first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6';
export const TD = 'px-4 py-3 text-sm text-tdms-ink first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6';

export function Table({ label, head, children }: { label: string; head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
      <table className="min-w-full divide-y divide-tdms-hairline">
        <thead className="bg-tdms-bg/60">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-tdms-hairline">{children}</tbody>
      </table>
    </div>
  );
}

// --- Buttons and fields --------------------------------------------------------------------

export const BTN = `inline-flex items-center justify-center gap-2 rounded-xl bg-tdms-text px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0B6A45] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const BTN_SECONDARY = `inline-flex items-center justify-center gap-2 rounded-xl border border-tdms-hairline bg-white px-4 py-2.5 text-sm font-semibold text-tdms-ink shadow-sm transition hover:bg-tdms-bg disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const BTN_DANGER = `inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const BTN_SMALL = `inline-flex items-center justify-center gap-1.5 rounded-lg border border-tdms-hairline bg-white px-2.5 py-1.5 text-xs font-semibold text-tdms-ink transition hover:bg-tdms-bg disabled:opacity-50 ${FOCUS}`;
export const INPUT = 'block w-full rounded-xl border-tdms-hairline text-sm text-tdms-ink shadow-sm focus:border-tdms-text focus:ring-tdms-text disabled:bg-tdms-bg';
export const LABEL = 'mb-1 block text-[13px] font-semibold text-tdms-ink';

export function Field({ label, htmlFor, error, hint, children, className = '' }: {
  label: string;
  htmlFor: string;
  error?: string[] | string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const messages = typeof error === 'string' ? [error] : error;
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={LABEL}>
        {label}
      </label>
      {children}
      {hint && !messages?.length && <p className="mt-1 text-xs text-tdms-muted">{hint}</p>}
      {messages?.map((m) => (
        <p key={m} className="mt-1 text-xs font-medium text-red-700">
          {m}
        </p>
      ))}
    </div>
  );
}

export function Flash({ kind, children }: { kind: 'success' | 'error' | 'info'; children: ReactNode }) {
  const styles = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-blue-200 bg-blue-50 text-blue-900',
  }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

// --- Status tones --------------------------------------------------------------------------

const TONES: Record<string, WorkTone> = {
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  OPEN: 'success',
  CLOSED: 'attention',
  PUBLISHED: 'success',
  FINALIZED: 'info',
  RELEASED: 'success',
  SUBMITTED: 'attention',
  UNDER_REVIEW: 'info',
  APPROVED: 'success',
  RETURNED: 'failed',
  PENDING: 'attention',
  REJECTED: 'failed',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
  PRESENT: 'success',
  LATE: 'attention',
  ABSENT: 'failed',
  EXCUSED: 'info',
  PASSED: 'success',
  FAILED: 'failed',
  INCOMPLETE: 'neutral',
  ACTIVE: 'success',
  UPCOMING: 'info',
  ARCHIVED: 'neutral',
  LIVE: 'success',
  COMPLETED: 'neutral',
  active: 'success',
  applicant: 'attention',
  transferred: 'info',
  graduated: 'success',
  dropped: 'failed',
  inactive: 'neutral',
  archived: 'neutral',
};

export function toneFor(status: string): WorkTone {
  return TONES[status] ?? 'neutral';
}

export function Chip({ status, label }: { status: string; label: string }) {
  return <StatusPill label={label} tone={toneFor(status)} />;
}
