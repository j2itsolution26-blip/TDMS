import type { ChartPanel } from '@/types/dashboard';
import { Panel, PanelEmpty } from './DashboardParts';
import type { DashboardIcon as DashboardIconName } from '@/types/dashboard';

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

/**
 * Share of a whole, as a ring. Greens for the largest parts, a neutral grey
 * for "Others", and every segment named in the legend with its count and
 * percentage — the colour is never the only way to tell parts apart.
 */
const DONUT_COLOURS = ['#006B4F', '#2F9E74', '#6FC2A0', '#0B4A36', '#A8DCC5'];
const OTHERS_COLOUR = '#94A3B8';

function Donut({ chart }: { chart: ChartPanel }) {
  const sorted = [...chart.points].filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, DONUT_COLOURS.length);
  const rest = sorted.slice(DONUT_COLOURS.length).reduce((sum, p) => sum + p.value, 0);
  const parts = [
    ...top.map((p, i) => ({ ...p, colour: DONUT_COLOURS[i]! })),
    ...(rest > 0 ? [{ label: 'Others', value: rest, colour: OTHERS_COLOUR }] : []),
  ];
  const total = parts.reduce((sum, p) => sum + p.value, 0);

  let at = 0;
  const stops = parts
    .map((p) => {
      const from = at;
      at += (p.value / total) * 100;
      return `${p.colour} ${from}% ${at}%`;
    })
    .join(', ');

  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div aria-hidden="true" className="flex flex-col items-center gap-5 pt-2 sm:flex-row sm:items-center">
      <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops})` }}>
        <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-card">
          <span className="text-2xl font-semibold leading-none text-ink tabular-nums">{total.toLocaleString('en-US')}</span>
          <span className="mt-1 text-xs capitalize text-muted">{chart.unit}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.colour }} />
              <span className="truncate text-ink">{p.label}</span>
            </span>
            <span className="shrink-0 text-muted tabular-nums">
              {p.value.toLocaleString('en-US')} · {pct(p.value)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DashboardChart({
  chart,
  icon,
  large = false,
}: {
  chart: ChartPanel;
  icon?: DashboardIconName;
  large?: boolean;
}) {
  // An all-zero chart is a flat line that looks like a rendering fault; say
  // what it means instead.
  const empty = chart.points.length === 0 || chart.points.every((p) => p.value === 0);

  return (
    <Panel
      id={`chart-${chart.title.toLowerCase().replace(/[^a-z]+/g, '-')}`}
      title={chart.title}
      description={chart.description}
      icon={icon}
      large={large}
      className="h-full"
    >
      {empty ? (
        <PanelEmpty note={chart.empty} icon={icon} />
      ) : (
        <figure>
          {chart.kind === 'bars' ? <Bars chart={chart} /> : chart.kind === 'donut' ? <Donut chart={chart} /> : <Breakdown chart={chart} />}
          <Summary chart={chart} />
        </figure>
      )}
    </Panel>
  );
}
