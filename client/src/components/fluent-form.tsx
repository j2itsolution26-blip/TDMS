import type { KeyboardEvent, ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

/**
 * Form controls for the Fluent-style dialogs (Create Subject, Record
 * Application): one field height, labels above inputs, a visible required
 * mark, inline errors tied to their inputs with aria-describedby.
 *
 * Colours are the design tokens (tailwind.config.ts): primary-600 for actions,
 * ink for text, muted for secondary text, primary-50 for tinted tiles; fields
 * add Fluent's darker bottom stroke so they stay identifiable at WCAG 3:1.
 */

export const FIELD = 'mt-1.5 block h-10 w-full rounded-lg border border-[#D6E2DD] border-b-[#7D8F88] bg-white px-3 text-sm text-ink placeholder:text-[#677872] transition focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20 aria-[invalid=true]:border-red-400 disabled:cursor-not-allowed disabled:bg-slate-50';
// bg-none: the forms plugin draws its own arrow; these selects use the chevron icon.
export const SELECT = `${FIELD} appearance-none bg-none pr-9`;
export const LABEL = 'text-[13px] font-semibold text-ink';
export const RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';
export const MUTED = 'text-muted';

export const BTN_PRIMARY = `inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70 ${RING}`;
export const BTN_SECONDARY = `inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#D6E2DD] bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${RING}`;
export const BTN_GHOST = `inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-primary-600 transition hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60 ${RING}`;
export const BTN_DANGER = `inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70 ${RING}`;

export function Req() {
  return <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>;
}

/** "(optional)" after a label, so required and optional fields read differently without colour. */
export function Opt() {
  return <span className={`ml-1 text-xs font-normal ${MUTED}`}>(optional)</span>;
}

export function Err({ id, messages }: { id: string; messages?: string[] }) {
  return messages?.length ? <p id={id} className="mt-1 text-xs font-medium text-red-700">{messages[0]}</p> : null;
}

export function Select({ id, value, onChange, children, invalid, describedBy, disabled }: {
  id: string; value: string | number; onChange: (v: string) => void; children: ReactNode; invalid?: boolean; describedBy?: string; disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select id={id} className={SELECT} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} aria-describedby={describedBy}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 mt-[3px] h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
    </div>
  );
}

export function IconTile({ icon: Icon, size = 'md' }: { icon: LucideIcon; size?: 'md' | 'lg' }) {
  return size === 'lg'
    ? <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600" aria-hidden="true"><Icon className="h-[22px] w-[22px]" /></span>
    : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600" aria-hidden="true"><Icon className="h-[18px] w-[18px]" /></span>;
}

export function SectionHead({ icon, title, hint, id }: { icon: LucideIcon; title: string; hint: string; id?: string }) {
  return (
    <div className="flex items-start gap-3">
      <IconTile icon={icon} />
      <div>
        <h3 id={id} className="text-[15px] font-semibold text-ink">{title}</h3>
        <p className={`text-xs ${MUTED}`}>{hint}</p>
      </div>
    </div>
  );
}

/** A row of mutually exclusive buttons, as a radio group (arrow keys move and choose). */
export function Segmented<T extends number | string>({ label, value, options, onChange, disabled }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean;
}) {
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const at = options.findIndex((o) => o.value === value);
    const next = options[(at + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length]!;
    onChange(next.value);
    const group = e.currentTarget;
    requestAnimationFrame(() => group.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus());
  }
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={keys} className="mt-1.5 grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} data-value={o.value} tabIndex={on ? 0 : -1} disabled={disabled} onClick={() => onChange(o.value)}
            className={`h-10 rounded-lg border px-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${RING} ${on ? 'border-primary-600 bg-primary-600 text-white shadow-sm' : 'border-[#D6E2DD] bg-white text-ink hover:border-primary-600/50 hover:bg-[#F4FBF8]'}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The numbered step indicator under a dialog's title, with a progress bar.
 * `onSelect` makes the steps clickable.
 */
export function StepNav({ steps, current, onSelect }: { steps: string[]; current: number; onSelect?: (step: number) => void }) {
  return (
    <nav aria-label="Steps" className="mt-4">
      <ol className="grid gap-2 sm:gap-4" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((label, i) => {
          const n = i + 1;
          const on = current === n;
          const done = current > n;
          const content = (
            <>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold transition ${on || done ? 'bg-primary-600 text-white' : 'bg-[#EEF2F1] text-muted'}`}>{n}</span>
              <span className={`min-w-0 leading-tight ${on ? 'font-semibold text-ink' : MUTED}`}><span className="sr-only">Step {n}: </span>{label}</span>
            </>
          );
          return (
            <li key={label}>
              {onSelect ? (
                <button type="button" onClick={() => onSelect(n)} aria-current={on ? 'step' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-md text-left text-[13px] sm:text-sm ${RING}`}>{content}</button>
              ) : (
                <span aria-current={on ? 'step' : undefined} className="flex items-center gap-2.5 text-[13px] sm:text-sm">{content}</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#E8EEEC]" aria-hidden="true">
        <div className="h-full rounded-full bg-primary-600 transition-all duration-300" style={{ width: `${(current / steps.length) * 100}%` }} />
      </div>
    </nav>
  );
}
