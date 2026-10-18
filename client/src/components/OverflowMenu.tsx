import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { MoreHorizontal } from 'lucide-react';
import Link from '@/lib/link';

/**
 * A row's "⋯" menu: a real button that opens a list of real links and buttons.
 *
 *   * the trigger is named (aria-label) and says it opens a menu;
 *   * opening moves focus to the first item; ↑ ↓ Home End move between items;
 *     Esc or Tab closes it and focus returns to the trigger; a click outside,
 *     a scroll or a resize closes it;
 *   * it is drawn `position: fixed` beside the trigger, so a table's scrolling
 *     container never clips it.
 */

export interface OverflowMenuItem {
  label: string;
  /** A link, or an action — one of the two. */
  href?: string;
  onSelect?: () => void;
  /** Destructive: drawn in red. */
  danger?: boolean;
  disabled?: boolean;
}

export default function OverflowMenu({ label, items }: { label: string; items: OverflowMenuItem[] }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);

  function show() {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    // Below the trigger, right edges aligned; above it when there is no room below.
    const below = window.innerHeight - r.bottom > 44 * items.length + 16;
    setPlace({ top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - (44 * items.length + 8)), right: window.innerWidth - r.right });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) close(false);
    };
    // Close when the page really scrolls the trigger away — not on a re-render's no-op scroll event.
    const start = trigger.current?.getBoundingClientRect();
    const onMove = () => {
      const now = trigger.current?.getBoundingClientRect();
      if (!start || !now || Math.abs(now.top - start.top) > 2 || Math.abs(now.left - start.left) > 2) close(false);
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, close]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const all = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    const move = (i: number) => { e.preventDefault(); all[(i + all.length) % all.length]?.focus(); };
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(all.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close(false);
  }

  const ITEM = 'flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-medium focus:outline-none focus-visible:bg-surface disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); show(); } }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#D6E2DD] bg-white text-slate-600 transition-colors hover:bg-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>
      {open && place && (
        <div
          ref={menu}
          id={`${id}-menu`}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={{ position: 'fixed', top: place.top, right: place.right }}
          className="z-50 min-w-[11rem] rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {items.map((item) => {
            const tone = item.danger ? 'text-red-700 hover:bg-red-50' : 'text-ink hover:bg-surface';
            return item.href && !item.disabled ? (
              <Link key={item.label} href={item.href} role="menuitem" tabIndex={-1} className={`${ITEM} ${tone}`} onClick={() => close(false)}>
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                aria-disabled={item.disabled || undefined}
                className={`${ITEM} ${tone}`}
                onClick={() => { close(false); item.onSelect?.(); }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
