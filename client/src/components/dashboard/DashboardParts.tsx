import Link from '@/lib/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { diffForHumans } from '@shared/lib/dates';
import type { EmptyNote, Kpi, ListItem, ListPanel, QuickAction, StatusPanel } from '@shared/types/dashboard';
import DashboardIcon from './DashboardIcon';
import type { DashboardIcon as DashboardIconName } from '@shared/types/dashboard';

/**
 * The building blocks every dashboard is assembled from.
 *
 * Server components throughout: nothing here needs the browser, so none of it
 * ships JavaScript, and a dashboard renders complete on the first response
 * rather than as a shell that fetches its own numbers.
 *
 * Accessibility, once, here — so all seven dashboards get it:
 *   * every panel is a <section> labelled by its heading;
 *   * whole-card links have one accessible name and a visible focus ring;
 *   * statuses are words in a badge, never colour alone;
 *   * icons are decorative (DashboardIcon hides them).
 */

const FOCUS =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';

// --- KPI --------------------------------------------------------------------------

const HINT_TONE: Record<NonNullable<Kpi['tone']>, string> = {
  neutral: 'text-muted',
  positive: 'text-primary-700',
  attention: 'text-amber-800',
};

export function KpiCard({ kpi, size = 'default' }: { kpi: Kpi; size?: 'default' | 'large' }) {
  const value = typeof kpi.value === 'number' ? kpi.value.toLocaleString('en-US') : kpi.value;
  const large = size === 'large';
  const pct = kpi.progress && kpi.progress.max > 0 ? Math.round((kpi.progress.value / kpi.progress.max) * 100) : null;

  const body = (
    <>
      <span className="flex items-start gap-3">
        <span
          className={`flex shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ${large ? 'h-12 w-12' : 'h-10 w-10'}`}
        >
          <DashboardIcon name={kpi.icon} className={large ? 'h-6 w-6' : 'h-5 w-5'} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm text-muted">{kpi.label}</span>
          <span
            className={`mt-0.5 block truncate font-semibold leading-tight text-ink tabular-nums ${large ? 'text-[28px]' : 'text-2xl'}`}
          >
            {value}
          </span>
          {kpi.hint && (
            // Two lines, not one-and-an-ellipsis: the end of a hint is often the point.
            <span className={`mt-1 block line-clamp-2 text-xs font-medium ${HINT_TONE[kpi.tone ?? 'neutral']}`}>
              {kpi.hint}
            </span>
          )}
        </span>
      </span>
      {pct !== null && kpi.progress && (
        /*
         * A meter, because it is one: a real "x of y". The label is the
         * accessible name, so the bar means the same thing to a screen reader.
         */
        <span
          role="meter"
          aria-label={kpi.progress.label}
          aria-valuemin={0}
          aria-valuemax={kpi.progress.max}
          aria-valuenow={kpi.progress.value}
          title={kpi.progress.label}
          className="mt-4 block h-1.5 w-full overflow-hidden rounded-full bg-primary-50"
        >
          <span className="block h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
        </span>
      )}
    </>
  );

  const shell = `flex h-full flex-col rounded-xl border border-border bg-card shadow-card ${large ? 'p-5' : 'p-4'}`;

  return kpi.href ? (
    <Link href={kpi.href} className={`${shell} transition-colors hover:border-primary-200 ${FOCUS}`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/**
 * Columns chosen by how many cards there are, so a row is never left with
 * one orphan: six cards are two rows of three rather than five and one.
 */
const KPI_COLUMNS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6',
};

export function KpiGrid({ kpis, size = 'default' }: { kpis: Kpi[]; size?: 'default' | 'large' }) {
  if (kpis.length === 0) return null;
  return (
    <ul
      aria-label="Key figures"
      className={`grid grid-cols-1 gap-4 ${KPI_COLUMNS[kpis.length] ?? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}
    >
      {kpis.map((kpi) => (
        <li key={kpi.key}>
          <KpiCard kpi={kpi} size={size} />
        </li>
      ))}
    </ul>
  );
}

// --- Panels --------------------------------------------------------------------------

export function Panel({
  id,
  title,
  description,
  viewAll,
  children,
  className = '',
  icon,
  large = false,
}: {
  id: string;
  title: string;
  description?: string;
  viewAll?: { label: string; href: string };
  children: ReactNode;
  className?: string;
  /** A glyph beside the title, as the Director layout draws its sections. */
  icon?: DashboardIconName;
  /** An 18px section title rather than 16px. */
  large?: boolean;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className={`flex min-w-0 flex-col rounded-xl border border-border bg-card shadow-card ${className}`}
    >
      <header className={`flex items-start justify-between gap-3 ${large ? 'px-6 pt-5 pb-3' : 'px-5 pt-4 pb-3'}`}>
        <div className="flex min-w-0 items-start gap-2.5">
          {icon && (
            <span className="mt-0.5 text-primary-600">
              <DashboardIcon name={icon} />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={headingId} className={`font-semibold text-ink ${large ? 'text-lg' : 'text-base'}`}>
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
        </div>
        {viewAll && (
          <Link
            href={viewAll.href}
            className={`shrink-0 rounded text-sm font-medium text-primary-700 hover:text-primary-800 hover:underline ${FOCUS}`}
          >
            {viewAll.label}
            <span aria-hidden="true"> →</span>
            <span className="sr-only"> — {title}</span>
          </Link>
        )}
      </header>
      <div className={`flex-1 ${large ? 'px-6 pb-5' : 'px-5 pb-4'}`}>{children}</div>
    </section>
  );
}

/** "No data" that says what the absence means — never a bare zero. */
export function PanelEmpty({ note, icon }: { note: EmptyNote; icon?: DashboardIconName }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-8 text-center">
      {icon && (
        <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary-600">
          <DashboardIcon name={icon} />
        </span>
      )}
      <p className="text-sm font-medium text-ink">{note.title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted">{note.description}</p>
      {note.action && (
        <Link
          href={note.action.href}
          className={`mt-3 rounded text-sm font-medium text-primary-700 hover:underline ${FOCUS}`}
        >
          {note.action.label}
        </Link>
      )}
    </div>
  );
}

function ItemRow({ item }: { item: ListItem }) {
  const right = (
    <span className="flex shrink-0 flex-col items-end gap-1 text-right">
      {item.status && <Badge status={item.status.status} label={item.status.label} />}
      {(item.meta || item.at) && (
        <span className="text-xs text-muted tabular-nums">
          {item.meta ?? (item.at ? diffForHumans(item.at) : null)}
        </span>
      )}
    </span>
  );

  const content = (
    <>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
        {item.subtitle && <span className="mt-0.5 block truncate text-xs text-muted">{item.subtitle}</span>}
      </span>
      {right}
    </>
  );

  const row = 'flex items-start justify-between gap-3 py-2.5';
  return (
    <li className="border-b border-border last:border-b-0">
      {item.href ? (
        <Link href={item.href} className={`${row} -mx-2 rounded-md px-2 hover:bg-surface ${FOCUS}`}>
          {content}
        </Link>
      ) : (
        <div className={row}>{content}</div>
      )}
    </li>
  );
}

export function ListPanelView({ id, panel }: { id: string; panel: ListPanel }) {
  return (
    <Panel id={id} title={panel.title} description={panel.description} viewAll={panel.viewAll}>
      {panel.items.length === 0 ? (
        <PanelEmpty note={panel.empty} />
      ) : (
        <ul>
          {panel.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

// --- Status panels -------------------------------------------------------------------

export function StatusPanelView({ panel }: { panel: StatusPanel }) {
  return (
    <Panel id={panel.id} title={panel.title} description={panel.description}>
      <dl className="divide-y divide-border">
        {panel.rows.map((row) => {
          const value = (
            <span className="flex shrink-0 items-center gap-2">
              {row.value && <span className="text-sm font-semibold text-ink tabular-nums">{row.value}</span>}
              {row.status && <Badge status={row.status.status} label={row.status.label} />}
            </span>
          );
          return (
            <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
              <dt className="min-w-0 truncate text-sm text-ink">
                {row.href ? (
                  <Link href={row.href} className={`rounded hover:text-primary-700 hover:underline ${FOCUS}`}>
                    {row.label}
                  </Link>
                ) : (
                  row.label
                )}
              </dt>
              <dd>{value}</dd>
            </div>
          );
        })}
      </dl>
      {panel.actions && panel.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {panel.actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${FOCUS} ${
                action.primary
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'border border-border bg-card text-ink hover:border-primary-200 hover:bg-primary-50'
              }`}
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

// --- Quick actions -------------------------------------------------------------------

export function QuickActions({ actions, wide = false }: { actions: QuickAction[]; wide?: boolean }) {
  if (actions.length === 0) return null;
  return (
    <Panel id="quick-actions" title="Quick Actions" description="Pages you can open">
      <ul className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${wide ? 'lg:grid-cols-3 2xl:grid-cols-6' : 'xl:grid-cols-3'}`}>
        {actions.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              className={`flex h-full items-start gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary-200 hover:bg-primary-50 ${FOCUS}`}
            >
              <span className="mt-0.5 text-primary-600">
                <DashboardIcon name={action.icon} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{action.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{action.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// --- Notices --------------------------------------------------------------------------

/**
 * A plain statement of what this dashboard cannot show. Used instead of empty
 * cards dressed up as features that do not exist.
 */
export function DashboardNotice({ title, body }: { title: string; body: string }) {
  return (
    <aside
      aria-label="About this dashboard"
      className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
      <div className="text-sm">
        <p className="font-semibold text-blue-900">{title}</p>
        <p className="mt-0.5 text-blue-800">{body}</p>
      </div>
    </aside>
  );
}
