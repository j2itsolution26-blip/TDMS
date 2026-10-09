import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';

/**
 * A searchable single-select: a button that opens a search box and a list.
 *
 * WHY A PORTAL. The list is rendered into document.body, positioned against
 * the viewport. Drawn inside a modal it would be clipped by the panel's
 * `overflow: hidden`, and its `transform` would make even `position: fixed`
 * relative to the panel — which is how a long option list ends up cut off
 * behind the footer. Out here nothing clips it.
 *
 * It opens below the field, or above it when there is more room there, and
 * follows the field while the page or the modal scrolls.
 *
 * Keyboard (WAI-ARIA combobox with listbox popup): Enter/Space/↓ open;
 * type to filter; ↑/↓/Home/End move; Enter picks; Escape closes without
 * closing the modal behind it; Tab moves on.
 */

export interface ComboboxOption {
  value: string;
  /** Shown in the field and the list, in full — it wraps rather than truncates. */
  label: string;
  /** A second line in the list, e.g. a school year. */
  description?: string;
  /** Extra text the search matches, e.g. a program code. */
  keywords?: string;
}

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  /** Shown in the list when nothing matches or there is nothing to choose. */
  emptyText?: string;
  disabled?: boolean;
  loading?: boolean;
  invalid?: boolean;
  required?: boolean;
  /** Ids of elements describing the field (hint, error). */
  describedBy?: string;
  /** The visible label's id, for screen readers. */
  labelledBy?: string;
  /** Rendered before the option label in the list and the field. */
  renderLead?: (option: ComboboxOption) => ReactNode;
}

const MENU_MAX = 320;
const GAP = 6;
const EDGE = 8;

function normalise(text: string) {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export default function Combobox({
  id, value, onChange, options, placeholder = 'Select…', searchPlaceholder = 'Search…', emptyText = 'No matches.',
  disabled = false, loading = false, invalid = false, required = false, describedBy, labelledBy, renderLead,
}: Props) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ top: number; left: number; width: number; maxHeight: number; above: boolean } | null>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const words = normalise(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return options;
    return options.filter((o) => {
      const haystack = normalise(`${o.label} ${o.keywords ?? ''} ${o.description ?? ''}`);
      return words.every((w) => haystack.includes(w));
    });
  }, [options, query]);

  /** Below if it fits, otherwise wherever there is more room; never off-screen. */
  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const below = viewportH - r.bottom - GAP - EDGE;
    const aboveSpace = r.top - GAP - EDGE;
    const wanted = Math.min(MENU_MAX, (menuRef.current?.scrollHeight ?? MENU_MAX));
    const above = below < wanted && aboveSpace > below;
    const maxHeight = Math.max(160, Math.min(MENU_MAX, above ? aboveSpace : below));
    const width = Math.min(Math.max(r.width, 280), viewportW - EDGE * 2);
    const left = Math.min(Math.max(EDGE, r.left), viewportW - width - EDGE);
    setPlace({ top: above ? r.top - GAP : r.bottom + GAP, left, width, maxHeight, above });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    // The field may be scrolled out of sight in a long form; bring it into
    // view first so the list opens beside it rather than over it.
    triggerRef.current?.scrollIntoView({ block: 'nearest' });
    reposition();
    // Capture: the modal body scrolls, not just the window.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition, filtered.length]);

  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      const at = Math.max(0, options.findIndex((o) => o.value === value));
      setActive(at);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlighted option in view while moving through a long list —
  // by scrolling the list only. scrollIntoView would also scroll the page and
  // the dialog behind it.
  useEffect(() => {
    if (!open) return;
    const option = document.getElementById(`${listId}-${active}`);
    const list = option?.parentElement;
    if (!option || !list) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    }
  }, [active, open, listId]);

  function choose(option: ComboboxOption) {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(filtered.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = filtered[active]; if (o) choose(o); }
    else if (e.key === 'Escape') {
      // Close the list, not the dialog behind it.
      e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation();
      setOpen(false); triggerRef.current?.focus();
    } else if (e.key === 'Tab') { setOpen(false); }
  }

  const activeId = filtered[active] ? `${listId}-${active}` : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelledBy ? `${labelledBy} ${id}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
        className={`flex min-h-10 w-full items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
          invalid ? 'border-red-400 focus-visible:border-red-500' : open ? 'border-primary-600' : 'border-slate-300 hover:border-slate-400 focus-visible:border-primary-600'
        }`}
      >
        <span className={`min-w-0 flex-1 break-words ${selected ? 'text-ink' : 'text-slate-400'}`}>
          {selected ? (
            <span className="flex items-start gap-2">
              {renderLead?.(selected)}
              <span>{selected.label}</span>
            </span>
          ) : (
            placeholder
          )}
        </span>
        {loading
          ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-hidden="true" />
          : <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />}
      </button>

      {open && place && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: place.left,
            width: place.width,
            maxHeight: place.maxHeight,
            ...(place.above ? { bottom: window.innerHeight - place.top } : { top: place.top }),
          }}
          className="z-[1000] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(16,42,67,0.14)]"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              aria-label={searchPlaceholder}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onSearchKey}
              placeholder={searchPlaceholder}
              className="w-full border-0 p-0 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-0"
            />
          </div>
          <ul id={listId} role="listbox" className="relative min-h-0 flex-1 overflow-y-auto py-1" aria-label={searchPlaceholder}>
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted" role="presentation">{emptyText}</li>
            ) : (
              filtered.map((o, i) => {
                const isSelected = o.value === value;
                return (
                  <li
                    key={o.value}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className={`mx-1 flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-sm ${i === active ? 'bg-primary-50 text-ink' : 'text-ink'}`}
                  >
                    {renderLead?.(o)}
                    <span className="min-w-0 flex-1 break-words">
                      <span className={isSelected ? 'font-semibold' : undefined}>{o.label}</span>
                      {o.description && <span className="block text-xs text-muted">{o.description}</span>}
                    </span>
                    {isSelected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />}
                  </li>
                );
              })
            )}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
