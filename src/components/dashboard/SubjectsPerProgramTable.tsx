'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ProgramReadiness } from '@/types/dashboard';

/**
 * Subjects per Program, sortable and filterable in the browser. The rows are
 * the server's — one per program, already computed — so sorting and
 * filtering cost no request.
 */

type SortKey = 'name' | 'curriculum' | 'subjects' | 'units' | 'emptyTerms' | 'status';
type Filter = 'all' | 'ready' | 'attention' | 'inactive';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'Ready' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'inactive', label: 'Inactive' },
];

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; hide?: string }[] = [
  { key: 'name', label: 'Program' },
  { key: 'curriculum', label: 'Curriculum', hide: 'hidden md:table-cell' },
  { key: 'subjects', label: 'Subjects', numeric: true },
  { key: 'units', label: 'Units', numeric: true, hide: 'hidden lg:table-cell' },
  { key: 'emptyTerms', label: 'Empty terms', numeric: true, hide: 'hidden sm:table-cell' },
  { key: 'status', label: 'Status' },
];

const PILL: Record<string, string> = {
  ready: 'bg-emerald-50 text-emerald-800',
  needs_review: 'bg-amber-50 text-amber-800',
  inactive: 'bg-slate-100 text-slate-700',
};
const DOT: Record<string, string> = { ready: 'bg-emerald-600', needs_review: 'bg-amber-500', inactive: 'bg-slate-400' };

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-tdms-text focus-visible:ring-offset-2';

function matches(row: ProgramReadiness, filter: Filter) {
  if (filter === 'ready') return row.ready;
  if (filter === 'inactive') return row.status.status === 'inactive';
  if (filter === 'attention') return row.status.status === 'needs_review';
  return true;
}

export default function SubjectsPerProgramTable({ rows }: { rows: ProgramReadiness[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo(() => {
    const value = (r: ProgramReadiness): string | number =>
      sort.key === 'status' ? r.status.label : sort.key === 'curriculum' ? (r.curriculum ?? '') : r[sort.key];
    return rows
      .filter((r) => matches(r, filter))
      .sort((a, b) => {
        const x = value(a);
        const y = value(b);
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
        return sort.dir === 'asc' ? c : -c;
      });
  }, [rows, sort, filter]);

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: COLUMNS.find((c) => c.key === key)?.numeric ? 'desc' : 'asc' }));
  }

  return (
    <div>
      <div role="group" aria-label="Filter programs" className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = rows.filter((r) => matches(r, f.value)).length;
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${FOCUS} ${
                active ? 'border-tdms-text bg-tdms-text text-white' : 'border-tdms-hairline bg-white text-tdms-ink hover:bg-tdms-bg'
              }`}
            >
              {f.label} <span className={active ? 'text-white/80' : 'text-tdms-muted'}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="-mx-5 overflow-x-auto sm:-mx-6" role="region" aria-label="Subjects per program" tabIndex={0}>
        <table className="w-full text-sm">
          <caption className="sr-only">Subjects per program, sorted by {COLUMNS.find((c) => c.key === sort.key)?.label} ({sort.dir === 'asc' ? 'ascending' : 'descending'})</caption>
          <thead>
            <tr className="border-y border-tdms-hairline bg-tdms-bg text-xs font-semibold uppercase tracking-wide text-tdms-muted">
              {COLUMNS.map((c, i) => {
                const sorted = sort.key === c.key;
                const Icon = !sorted ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`py-1.5 ${i === 0 ? 'pl-5 pr-3 sm:pl-6' : i === COLUMNS.length - 1 ? 'pl-3 pr-5 sm:pr-6' : 'px-3'} ${c.numeric ? 'text-right' : 'text-left'} ${c.hide ?? ''}`}
                  >
                    <button type="button" onClick={() => toggle(c.key)} className={`inline-flex items-center gap-1 rounded py-1 uppercase hover:text-tdms-ink ${FOCUS}`}>
                      {c.label}
                      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-6 py-8 text-center text-sm text-tdms-muted">
                  No programs match this filter.
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} className="border-b border-tdms-hairline last:border-b-0 hover:bg-tdms-bg/60">
                  <td className="max-w-[16rem] py-3 pl-5 pr-3 sm:pl-6">
                    <Link href={`/programs/${r.id}`} className={`block rounded ${FOCUS}`}>
                      <span className="block truncate font-semibold text-tdms-ink hover:underline">{r.name}</span>
                      <span className="block text-xs text-tdms-muted">{r.code}</span>
                    </Link>
                  </td>
                  <td className="hidden px-3 py-3 text-tdms-ink md:table-cell">{r.curriculum ?? <span className="text-tdms-muted">None active</span>}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-tdms-ink">{r.subjects}</td>
                  <td className="hidden px-3 py-3 text-right tabular-nums lg:table-cell">{r.units}</td>
                  <td className={`hidden px-3 py-3 text-right tabular-nums sm:table-cell ${r.emptyTerms > 0 ? 'font-semibold text-amber-800' : ''}`}>{r.emptyTerms}</td>
                  <td className="py-3 pl-3 pr-5 sm:pr-6">
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[r.status.status] ?? PILL.inactive}`}>
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[r.status.status] ?? DOT.inactive}`} />
                      {r.status.label}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
