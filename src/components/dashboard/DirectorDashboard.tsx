import Link from 'next/link';
import { Badge } from '@/components/ui';
import { diffForHumans } from '@/lib/dates';
import type {
  DashboardIcon as IconName,
  DashboardView,
  DirectorPanels,
  ListItem,
  ListPanel,
  QuickAction,
  TableCell,
  TablePanel,
} from '@/types/dashboard';
import DashboardChart from './DashboardChart';
import DashboardIcon from './DashboardIcon';
import { KpiGrid, Panel, PanelEmpty } from './DashboardParts';

/**
 * The Director's dashboard, laid out on the reference design's grid:
 *
 *   KPI row ................ five cards with real "x of y" ratio bars
 *   analytics row .......... Enrollment Trend · Enrollment by Program · Director Actions
 *   records row ............ Program Oversight · Recent Applications (tables)
 *   bottom row ............. Quick Actions · Recent Activity
 *
 * Only the ARRANGEMENT is Director-specific. Every figure comes from the same
 * policy-gated service as every other role (getDashboardView), and the panels
 * are the shared ones with opt-in variants, so the design system stays one
 * system. The other six roles keep the shared layout.
 *
 * Server components throughout: nothing here fetches in the browser.
 */

const FOCUS =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';

// --- Director Actions ------------------------------------------------------------------

/**
 * Decisions in progress, as the reference's summary card: a glyph, what it
 * is, and a pill that reads "Clear" or "3 Pending" — in words, not only colour.
 */
function ActionsCard({ panel }: { panel: ListPanel }) {
  return (
    <Panel id="director-actions" title={panel.title} description={panel.description} icon="shield" large className="h-full">
      {panel.items.length === 0 ? (
        <PanelEmpty note={panel.empty} icon="shield" />
      ) : (
        <ul className="space-y-1">
          {panel.items.map((item) => {
            const waiting = item.status?.status === 'pending';
            const row = (
              <>
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    waiting ? 'bg-amber-50 text-amber-700' : 'bg-primary-50 text-primary-600'
                  }`}
                >
                  <DashboardIcon name={item.icon ?? 'shield'} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{item.title}</span>
                  {item.subtitle && <span className="block text-xs text-muted">{item.subtitle}</span>}
                </span>
                <Badge
                  status={waiting ? 'pending' : 'completed'}
                  label={waiting ? `${item.meta ?? ''} Pending`.trim() : 'Clear'}
                />
              </>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface ${FOCUS}`}>
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-2">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// --- Tables -----------------------------------------------------------------------------

function isStatus(cell: TableCell): cell is { status: string; label: string } {
  return typeof cell === 'object' && 'status' in cell;
}

function Cell({ cell }: { cell: TableCell | undefined }) {
  if (cell === undefined) return null;
  if (typeof cell === 'string') return <>{cell}</>;
  if (isStatus(cell)) return <Badge status={cell.status} label={cell.label} />;
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium text-ink">{cell.text}</span>
      {cell.sub && <span className="block truncate text-xs text-muted">{cell.sub}</span>}
    </span>
  );
}

/**
 * A records table. Secondary columns drop on narrow screens (hideOnMobile)
 * so it fits a phone without the page scrolling sideways; the wrapper still
 * scrolls internally if a long name demands it. The first cell carries the
 * row's link, so every row is reachable by keyboard with one tab stop.
 */
function TableCard({ table, icon }: { table: TablePanel; icon: IconName }) {
  const hide = (hidden?: boolean) => (hidden ? 'hidden sm:table-cell' : '');
  const align = (a?: 'left' | 'right') => (a === 'right' ? 'text-right' : 'text-left');

  return (
    <Panel id={table.id} title={table.title} description={table.description} viewAll={table.viewAll} icon={icon} large className="h-full">
      {table.rows.length === 0 ? (
        <PanelEmpty note={table.empty} icon={icon} />
      ) : (
        <div className="-mx-6 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{table.title}</caption>
            <thead>
              <tr className="border-y border-border bg-surface">
                {table.columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`px-6 py-2 text-xs font-semibold uppercase tracking-wide text-muted ${align(c.align)} ${hide(c.hideOnMobile)}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-surface">
                  {table.columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={`px-6 py-2.5 text-ink tabular-nums ${align(c.align)} ${hide(c.hideOnMobile)} ${i === 0 ? 'max-w-[16rem]' : 'whitespace-nowrap'}`}
                    >
                      {i === 0 && row.href ? (
                        <Link href={row.href} className={`block rounded hover:underline ${FOCUS}`}>
                          <Cell cell={row.cells[c.key]} />
                        </Link>
                      ) : (
                        <Cell cell={row.cells[c.key]} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// --- Quick actions & activity ------------------------------------------------------------

function CompactActions({ actions }: { actions: QuickAction[] }) {
  return (
    <Panel id="quick-actions" title="Quick Actions" description="Pages you can open" icon="calendar" large className="h-full">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {actions.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              className={`flex h-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 transition-colors hover:border-primary-200 hover:bg-primary-50 ${FOCUS}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary-600 ring-1 ring-border">
                <DashboardIcon name={action.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{action.label}</span>
                <span className="block truncate text-xs text-muted">{action.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** A tint per kind of event, as the reference's activity chips. The title says the kind too. */
const CHIP: Partial<Record<IconName, string>> = {
  applications: 'bg-amber-50 text-amber-700',
  enrollment: 'bg-primary-50 text-primary-700',
  students: 'bg-blue-50 text-blue-700',
  documents: 'bg-green-50 text-green-700',
};

function ActivityFeed({ panel }: { panel: ListPanel }) {
  return (
    <Panel id="activity" title={panel.title} description={panel.description} icon="audit" large className="h-full">
      {panel.items.length === 0 ? (
        <PanelEmpty note={panel.empty} icon="audit" />
      ) : (
        <ul className="space-y-1">
          {panel.items.map((item: ListItem) => {
            const row = (
              <>
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${CHIP[item.icon ?? 'audit'] ?? 'bg-slate-100 text-slate-600'}`}
                >
                  <DashboardIcon name={item.icon ?? 'audit'} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                  {item.subtitle && <span className="block truncate text-xs text-muted">{item.subtitle}</span>}
                </span>
                {item.at && <span className="shrink-0 text-xs text-muted tabular-nums">{diffForHumans(item.at)}</span>}
              </>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface ${FOCUS}`}>
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-2">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// --- The page body ------------------------------------------------------------------------

export default function DirectorDashboard({
  view,
  panels,
  greetingLine,
}: {
  view: DashboardView;
  panels: DirectorPanels;
  greetingLine: string;
}) {
  const analytics = [panels.trend, panels.distribution].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted">{greetingLine}</p>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">{view.title}</h1>
        <p className="text-[15px] text-muted">{view.description}</p>
      </header>

      <KpiGrid kpis={view.kpis} size="large" />

      {/* Analytics: trend, distribution, actions — the reference's second row. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-12">
        {panels.trend && (
          <div className={analytics === 2 ? 'xl:col-span-5' : 'xl:col-span-8'}>
            <DashboardChart chart={panels.trend} icon="enrollment" large />
          </div>
        )}
        {panels.distribution && (
          <div className={analytics === 2 ? 'xl:col-span-4' : 'xl:col-span-8'}>
            <DashboardChart chart={panels.distribution} icon="programs" large />
          </div>
        )}
        <div className={`${analytics === 2 ? 'lg:col-span-2 xl:col-span-3' : analytics === 1 ? 'xl:col-span-4' : 'lg:col-span-2 xl:col-span-12'}`}>
          <ActionsCard panel={panels.actions} />
        </div>
      </div>

      {/* Records: the two tables. */}
      {(panels.oversight || panels.applications) && (
        <div className={`grid grid-cols-1 gap-5 ${panels.oversight && panels.applications ? 'xl:grid-cols-2' : ''}`}>
          {panels.oversight && <TableCard table={panels.oversight} icon="programs" />}
          {panels.applications && <TableCard table={panels.applications} icon="applications" />}
        </div>
      )}

      <div className={`grid grid-cols-1 gap-5 ${view.activity ? 'xl:grid-cols-12' : ''}`}>
        <div className={view.activity ? 'xl:col-span-7' : undefined}>
          <CompactActions actions={view.quickActions} />
        </div>
        {view.activity && (
          <div className="xl:col-span-5">
            <ActivityFeed panel={view.activity} />
          </div>
        )}
      </div>
    </div>
  );
}
