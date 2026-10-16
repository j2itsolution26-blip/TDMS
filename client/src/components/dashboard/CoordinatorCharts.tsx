import Link from '@/lib/link';
import type { SectionLoad, StatusMix, TermEnrollment, WorkTone } from '@shared/types/dashboard';
import { yearLevelLabel } from '@shared/lib/teaching';
import { EmptyState, FOCUS } from './RoleDashboardParts';

/**
 * The Coordinator's charts, drawn with HTML, CSS and one SVG ring — TDMS has
 * no chart library, and three small charts do not justify one.
 *
 * Each chart is presentation (aria-hidden) beside the same numbers in words or
 * a table a screen reader can read, a legend for colour, and an empty state
 * that says what would appear. Every number comes from the workspace loader.
 */

const SERIES = {
  enrolled: { label: 'Enrolled', fill: 'bg-primary-500', dot: 'bg-primary-500' },
  pending: { label: 'Pending', fill: 'bg-accent-amber', dot: 'bg-accent-amber' },
  other: { label: 'Rejected or dropped', fill: 'bg-slate-300', dot: 'bg-slate-300' },
} as const;

const TONE_FILL: Record<WorkTone, string> = {
  success: '#087F5B',
  attention: '#D97706',
  info: '#2563EB',
  failed: '#E05B67',
  neutral: '#94A3B8',
};

function Legend({ items }: { items: { label: string; dot: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-tdms-muted" aria-hidden="true">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${i.dot}`} />{i.label}</li>
      ))}
    </ul>
  );
}

/** Stacked bars: enrollment records per term, by outcome. */
export function EnrollmentTrendChart({ terms }: { terms: TermEnrollment[] }) {
  if (terms.length === 0) {
    return <EmptyState icon="enrollment" title="No enrollment records yet" description="Each school term's enrolled, pending and rejected records will be charted here." />;
  }
  const totals = terms.map((t) => t.enrolled + t.pending + t.other);
  const max = Math.max(...totals, 1);
  return (
    <div>
      <Legend items={(['enrolled', 'pending', 'other'] as const).map((k) => ({ label: SERIES[k].label, dot: SERIES[k].dot }))} />
      <div aria-hidden="true" className="mt-4 flex h-52 items-end gap-3 border-b border-tdms-hairline pb-0 sm:gap-5">
        {terms.map((t, i) => (
          <div key={t.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-xs font-bold tabular-nums text-tdms-ink">{totals[i]}</span>
            <div className="flex w-full max-w-[56px] flex-col-reverse overflow-hidden rounded-t-lg" style={{ height: `${Math.max(totals[i]! > 0 ? 6 : 0, (totals[i]! / max) * 100)}%` }}>
              {(['enrolled', 'pending', 'other'] as const).map((k) => t[k] > 0 && (
                <span key={k} className={SERIES[k].fill} style={{ height: `${(t[k] / totals[i]!) * 100}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-2 flex gap-3 sm:gap-5">
        {terms.map((t) => (
          <span key={t.key} className="min-w-0 flex-1 text-center text-[11px] leading-tight text-tdms-muted">{t.label}</span>
        ))}
      </div>
      <div className="sr-only">
        <table>
          <caption>Enrollment records per school term</caption>
          <thead><tr><th scope="col">Term</th><th scope="col">Enrolled</th><th scope="col">Pending</th><th scope="col">Rejected or dropped</th></tr></thead>
          <tbody>
            {terms.map((t) => <tr key={t.key}><th scope="row">{t.label}</th><td>{t.enrolled}</td><td>{t.pending}</td><td>{t.other}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A ring per status breakdown, with each status as a link to its filtered list. */
export function StatusMixChart({ mixes, narrow = false }: { mixes: StatusMix[]; /** One ring per row, for a narrow card. */ narrow?: boolean }) {
  return (
    <div className={`grid grid-cols-1 gap-6 ${narrow ? 'sm:grid-cols-2 xl:grid-cols-1' : 'sm:grid-cols-2'}`}>
      {mixes.map((m) => {
        const total = m.segments.reduce((n, s) => n + s.value, 0);
        // An SVG ring: one arc per non-zero status.
        const r = 36;
        const c = 2 * Math.PI * r;
        let offset = 0;
        return (
          <div key={m.key} className="flex items-center gap-4">
            <div className="relative h-24 w-24 shrink-0 sm:h-28 sm:w-28" aria-hidden="true">
              <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
                <circle cx="48" cy="48" r={r} fill="none" strokeWidth="12" className="stroke-[#EEF3F0] dark:stroke-tdms-hairline" />
                {total > 0 && m.segments.filter((s) => s.value > 0).map((s) => {
                  const len = (s.value / total) * c;
                  const arc = <circle key={s.key} cx="48" cy="48" r={r} fill="none" stroke={TONE_FILL[s.tone]} strokeWidth="12" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />;
                  offset += len;
                  return arc;
                })}
              </svg>
              <span className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold tabular-nums text-tdms-ink">{total.toLocaleString('en-US')}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-tdms-muted">total</span>
              </span>
            </div>
            <div className="min-w-[9rem] flex-1">
              <Link href={m.href} className={`rounded text-sm font-bold text-tdms-ink hover:underline ${FOCUS}`}>{m.title}</Link>
              <ul className="mt-2 space-y-1">
                {m.segments.map((s) => (
                  <li key={s.key}>
                    <Link href={s.href ?? m.href} className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-0.5 text-[13px] hover:bg-tdms-bg ${FOCUS}`}>
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-tdms-muted">
                        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: TONE_FILL[s.tone] }} />
                        <span className="truncate">{s.label}</span>
                      </span>
                      <span className="font-semibold tabular-nums text-tdms-ink">{s.value.toLocaleString('en-US')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Sections and seats per program and year level, linking into Classes & Sections. */
export function SectionLoadChart({ load }: { load: SectionLoad }) {
  if (load.programs.length === 0) {
    return <EmptyState icon="programs" title={`No sections in ${load.schoolYear} yet`} description="Sections per program and year level will be shown here once they are created." action={{ label: 'Open Classes & Sections', href: '/class-setup?tab=sections' }} />;
  }
  return (
    <div className="space-y-5">
      {load.programs.map((p) => (
        <div key={p.id}>
          <p className="text-sm font-bold text-tdms-ink">{p.code} <span className="font-normal text-tdms-muted">· {p.name}</span></p>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {p.levels.map((l) => {
              const pct = l.capacity > 0 ? Math.round((l.students / l.capacity) * 100) : 0;
              const full = l.capacity > 0 && l.students >= l.capacity;
              return (
                <li key={l.level}>
                  <Link href={`/class-setup?tab=sections&program=${p.id}&level=${l.level}`}
                    className={`block rounded-xl border border-tdms-hairline p-3 transition hover:border-primary-200 hover:bg-primary-50/40 ${FOCUS}`}
                    aria-label={`${p.code} ${yearLevelLabel(l.level)}: ${l.sections} sections, ${l.students} of ${l.capacity} seats filled`}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold text-tdms-ink">{yearLevelLabel(l.level)}</span>
                      <span className="text-xs text-tdms-muted">{l.sections} {l.sections === 1 ? 'section' : 'sections'}</span>
                    </span>
                    <span aria-hidden="true" className="mt-2 block h-2 overflow-hidden rounded-full bg-tdms-bg">
                      <span className={`block h-full rounded-full ${full ? 'bg-accent-coral' : pct >= 80 ? 'bg-accent-amber' : 'bg-accent-blue'}`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className="mt-1.5 block text-xs tabular-nums text-tdms-muted">
                      {l.capacity === 0 ? 'No sections' : `${l.students} / ${l.capacity} seats`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
