import type { ChartPanel } from '@/types/dashboard';
import { Panel, PanelEmpty } from './DashboardParts';

/**
 * Two chart shapes, drawn with plain HTML and CSS.
 *
 * TDMS has no chart library and a dashboard does not justify adding one: a
 * handful of bars needs no canvas, no client JavaScript and no hydration. The
 * bars scale with their container, so they reflow on a phone instead of
 * overflowing it.
 *
 * Accessibility: the bars are presentation (aria-hidden). What a screen reader
 * gets is a sentence summarising the chart and the same numbers as a table —
 * the chart's data, not a description of its shapes.
 */

function Summary({ chart }: { chart: ChartPanel }) {
  const total = chart.points.reduce((sum, p) => sum + p.value, 0);
  const peak = chart.points.reduce((best, p) => (p.value > best.value ? p : best), chart.points[0]!);
  return (
    <>
      <p className="sr-only">
        {`${chart.title}: ${total.toLocaleString('en-US')} ${chart.unit} in total; highest ${peak.label} with ${peak.value.toLocaleString('en-US')}.`}
      </p>
      {/*
        sr-only goes on a wrapping div, not on the table: a table ignores the
        1px width sr-only sets and lays its cells out at full size anyway,
        pushing the page sideways on a phone.
      */}
      <div className="sr-only">
      <table>
        <caption>{chart.description}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">{chart.unit}</th>
          </tr>
        </thead>
        <tbody>
          {chart.points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

function Bars({ chart }: { chart: ChartPanel }) {
  const max = Math.max(...chart.points.map((p) => p.value));
  return (
    <div aria-hidden="true" className="flex h-48 items-end gap-2 pt-5 sm:gap-3">
      {chart.points.map((p) => {
        const height = max === 0 ? 0 : Math.max(4, Math.round((p.value / max) * 100));
        return (
          <div key={p.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[11px] font-medium text-muted tabular-nums">{p.value > 0 ? p.value : ''}</span>
            <div
              className={`w-full max-w-10 rounded-t ${p.value > 0 ? 'bg-primary-600' : 'bg-border'}`}
              style={{ height: p.value > 0 ? `${height}%` : '2px' }}
            />
            <span className="mt-2 w-full truncate text-center text-[11px] text-muted">{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Breakdown({ chart }: { chart: ChartPanel }) {
  const max = Math.max(...chart.points.map((p) => p.value));
  return (
    <ul aria-hidden="true" className="space-y-3 pt-1">
      {chart.points.map((p) => (
        <li key={p.label}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium text-ink">{p.label}</span>
            <span className="shrink-0 text-muted tabular-nums">{p.value.toLocaleString('en-US')}</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-primary-50">
            <div
              className="h-2 rounded-full bg-primary-600"
              style={{ width: max === 0 ? '0%' : `${Math.max(2, Math.round((p.value / max) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardChart({ chart }: { chart: ChartPanel }) {
  // An all-zero chart is a flat line that looks like a rendering fault; say
  // what it means instead.
  const empty = chart.points.length === 0 || chart.points.every((p) => p.value === 0);

  return (
    <Panel id="chart" title={chart.title} description={chart.description}>
      {empty ? (
        <PanelEmpty note={chart.empty} />
      ) : (
        <figure>
          {chart.kind === 'bars' ? <Bars chart={chart} /> : <Breakdown chart={chart} />}
          <Summary chart={chart} />
        </figure>
      )}
    </Panel>
  );
}
