import type { ReactNode } from 'react';

/**
 * Port of resources/views/components/*.blade.php.
 *
 * Every class string is the Blade one, so the rendered DOM is
 * indistinguishable. Blade's @props defaults become TypeScript defaults and
 * named slots become props.
 */

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// --- x-card ----------------------------------------------------------------

export function Card({
  children,
  padding = 'p-6',
  className,
}: {
  children: ReactNode;
  padding?: string;
  className?: string;
}) {
  return (
    <div className={cx('bg-card border border-border rounded-xl shadow-card', padding, className)}>
      {children}
    </div>
  );
}

// --- x-badge ---------------------------------------------------------------

/**
 * One badge vocabulary for every screen.
 *
 * Status is never carried by colour alone: every badge prints its label, and
 * the leading dot is a second, shape-based cue for people who cannot tell the
 * colours apart. Text colours are the -700 shades, which all clear WCAG AA on
 * their -50 backgrounds.
 */
const BADGE_TONES: Record<string, string> = {
  positive: 'bg-green-50 text-green-800 ring-green-600/20',
  attention: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  negative: 'bg-red-50 text-red-700 ring-red-600/20',
  info: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-500/20',
};

const DOT: Record<string, string> = {
  positive: 'bg-green-600',
  attention: 'bg-amber-500',
  negative: 'bg-red-600',
  info: 'bg-blue-600',
  neutral: 'bg-slate-400',
};

export function badgeTone(status: string): keyof typeof BADGE_TONES {
  const key = status.toLowerCase().replace(/[ -]/g, '_');

  if (['active', 'approved', 'completed', 'verified', 'enrolled', 'graduated', 'success', 'ready', 'configured', 'healthy'].includes(key))
    return 'positive';
  if (['pending', 'for_review', 'submitted', 'applicant', 'needs_review', 'under_review', 'overdue', 'incomplete'].includes(key))
    return 'attention';
  if (['rejected', 'cancelled', 'canceled', 'failed', 'returned', 'missing', 'suspended', 'expired', 'dropped', 'down'].includes(key))
    return 'negative';
  if (['processing', 'information', 'transferred', 'scheduled'].includes(key)) return 'info';
  return 'neutral'; // draft, inactive, archived, deactivated, anything unknown
}

export function Badge({ status, label }: { status: string; label?: string }) {
  const tone = badgeTone(status);
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        BADGE_TONES[tone],
      )}
    >
      <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', DOT[tone])} aria-hidden="true" />
      <span className={label ? undefined : 'capitalize'}>{label ?? status.replace(/_/g, ' ')}</span>
    </span>
  );
}

// --- x-avatar --------------------------------------------------------------

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials =
    name
      .trim()
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || '?';

  const sizeClasses =
    size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-sm';

  return (
    <div
      className={cx(
        'shrink-0 rounded-full bg-indigo-600 text-white font-semibold flex items-center justify-center',
        sizeClasses,
      )}
    >
      {initials}
    </div>
  );
}

// --- x-page-header ---------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string | null;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl sm:text-[28px] font-semibold text-ink leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

// --- x-empty-state ---------------------------------------------------------

export function EmptyState({
  title = 'Nothing here yet',
  description,
  actions,
}: {
  title?: string;
  description?: string | null;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center mb-4" aria-hidden="true">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.75h16.5M3.75 9.75a2.25 2.25 0 012.25-2.25h12a2.25 2.25 0 012.25 2.25M3.75 9.75v7.5A2.25 2.25 0 006 19.5h12a2.25 2.25 0 002.25-2.25v-7.5" />
        </svg>
      </div>
      <p className="text-sm font-medium text-navy-900">{title}</p>
      {description && <p className="mt-1 text-sm text-muted max-w-sm">{description}</p>}
      {actions && <div className="mt-4">{actions}</div>}
    </div>
  );
}

// --- x-alert ---------------------------------------------------------------

const ALERT_ICONS: Record<string, string> = {
  success: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  warning:
    'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  danger:
    'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  info: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z',
};

const ALERT_STYLES: Record<string, [string, string, string]> = {
  success: ['bg-green-50 border-green-200', 'text-green-800', 'text-green-500'],
  warning: ['bg-amber-50 border-amber-200', 'text-amber-800', 'text-amber-500'],
  danger: ['bg-red-50 border-red-200', 'text-red-800', 'text-red-500'],
  info: ['bg-blue-50 border-blue-200', 'text-blue-800', 'text-blue-500'],
};

export function Alert({
  type = 'info',
  title,
  children,
}: {
  type?: 'success' | 'warning' | 'danger' | 'info';
  title?: string | null;
  children: ReactNode;
}) {
  const [container, text, iconColor] = ALERT_STYLES[type] ?? ALERT_STYLES.info!;

  return (
    <div className={cx('flex gap-3 border rounded-xl p-4', container)}>
      <svg className={cx('w-5 h-5 shrink-0 mt-0.5', iconColor)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d={ALERT_ICONS[type] ?? ALERT_ICONS.info} />
      </svg>
      <div className={cx('text-sm', text)}>
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? 'mt-1' : ''}>{children}</div>
      </div>
    </div>
  );
}

// --- buttons ---------------------------------------------------------------
// The Blade versions were one-liners delegating to Tailwind classes.

export const BUTTON_PRIMARY =
  'inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50';

export const BUTTON_SECONDARY =
  'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50';

export const BUTTON_DANGER =
  'inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50';

export const BUTTON_SUCCESS =
  'inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50';

export const INPUT_CLASS =
  'block w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500';

export const LABEL_CLASS = 'block text-sm font-medium text-slate-700';

// --- field errors ----------------------------------------------------------

export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm text-red-600">
      {messages.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}

// --- pagination ------------------------------------------------------------

/** Laravel's paginate(10) links, rebuilt as plain anchors. */
export function Pagination({
  page,
  lastPage,
  total,
  basePath,
  query = {},
}: {
  page: number;
  lastPage: number;
  total: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  if (lastPage <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
    params.set('page', String(p));
    return `${basePath}?${params.toString()}`;
  };

  return (
    <nav className="flex items-center justify-between border-t border-border px-6 py-3" aria-label="Pagination">
      <p className="text-sm text-slate-500">
        Page {page} of {lastPage} &middot; {total} total
      </p>
      <div className="flex gap-2">
        <a
          href={page > 1 ? href(page - 1) : undefined}
          aria-disabled={page <= 1}
          className={cx(
            'rounded-lg border border-slate-300 px-3 py-1.5 text-sm',
            page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50',
          )}
        >
          Previous
        </a>
        <a
          href={page < lastPage ? href(page + 1) : undefined}
          aria-disabled={page >= lastPage}
          className={cx(
            'rounded-lg border border-slate-300 px-3 py-1.5 text-sm',
            page >= lastPage ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50',
          )}
        >
          Next
        </a>
      </div>
    </nav>
  );
}
