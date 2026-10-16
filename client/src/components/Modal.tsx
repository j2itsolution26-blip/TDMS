import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Open dialogs, oldest first; the last one owns Escape. */
const openStack: symbol[] = [];

/**
 * Port of resources/views/components/modal.blade.php: escape to close, body
 * scroll lock, backdrop click to close.
 *
 * Optional, for longer forms:
 *   subtitle    a second line under the title
 *   footer      actions pinned to the bottom; the body scrolls between
 *   appearance  'fluent' — 14px corners, a hairline border, a soft shadow,
 *               and a full-screen sheet on phones
 *
 * Without them it renders exactly as before, so existing screens are
 * unchanged. Dropdowns inside should render through a portal (see
 * Combobox): the panel clips its own overflow.
 *
 * Focus returns to whatever opened the dialog when it closes.
 *
 * Dialogs can stack (a confirmation over an edit form). Escape closes only
 * the top one; before, one press closed the confirmation and the form under it.
 *
 * Rendered into document.body. A `position: fixed` overlay is only fixed to
 * the viewport while no ancestor has a transform or filter; inside the app
 * shell on a phone one does, and the dialog ended up confined to the content
 * area, 24px down, with its footer pushed off-screen.
 */
export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'sm:max-w-2xl',
  appearance = 'default',
  maxHeight,
  animate = false,
  icon,
  headerExtra,
  trapFocus = false,
  titleClassName,
  role = 'dialog',
  describedBy,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  appearance?: 'default' | 'fluent';
  /** Fluent only: the panel's height limit on larger screens, e.g. 'sm:max-h-[90vh]'. */
  maxHeight?: string;
  /** A short fade-and-rise on opening (off under reduced motion). Opt-in. */
  animate?: boolean;
  /** Shown before the title, e.g. an icon in a tinted tile. */
  icon?: ReactNode;
  /** Rendered in the header under the title, e.g. a step indicator. */
  headerExtra?: ReactNode;
  /** Keep Tab and Shift+Tab inside the dialog while it is open. Opt-in. */
  trapFocus?: boolean;
  /** Replaces the title's default classes. */
  titleClassName?: string;
  /** 'alertdialog' for a question that interrupts, e.g. a confirmation. */
  role?: 'dialog' | 'alertdialog';
  /** The id of the element that describes the dialog; defaults to the subtitle. */
  describedBy?: string;
  /** False while a request is in flight: Escape, the backdrop and × do nothing, and × shows disabled. */
  dismissible?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();
  const opener = useRef<Element | null>(null);
  // Latest onClose without re-running the effect: callers pass a new function
  // each render, and re-running would restore focus mid-typing.
  const closeRef = useRef(onClose);
  closeRef.current = dismissible ? onClose : () => {};
  const trapRef = useRef(trapFocus);
  trapRef.current = trapFocus;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const self = Symbol('modal');
    openStack.push(self);

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && openStack[openStack.length - 1] === self) closeRef.current();
      // Focus stays inside: Tab from the last control wraps to the first, and back.
      if (e.key === 'Tab' && trapRef.current && panelRef.current) {
        // A dialog stacked on top (e.g. "Discard changes?") keeps its own focus.
        if (openStack[openStack.length - 1] !== self) return;
        const items = [...panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        )].filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const inside = panelRef.current.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener('keydown', onKey);

    // Alpine locked body scroll while a modal was open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      openStack.splice(openStack.indexOf(self), 1);
      document.body.style.overflow = previous;
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    };
  }, [open]);

  if (!open) return null;

  const fluent = appearance === 'fluent';
  const panel = fluent
    ? `relative flex w-full ${maxWidth} flex-col overflow-hidden bg-white max-sm:h-[100dvh] ${maxHeight ?? 'sm:max-h-[calc(100dvh-3rem)]'} ${animate ? 'animate-modal-in motion-reduce:animate-none' : ''} sm:rounded-[14px] sm:border sm:border-slate-200 sm:shadow-[0_12px_40px_rgba(16,42,67,0.16)]`
    : `relative w-full ${maxWidth} transform overflow-hidden rounded-xl bg-white shadow-xl transition-all ${animate ? 'animate-modal-in motion-reduce:animate-none' : ''}`;

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedBy ?? (subtitle ? subtitleId : undefined)}
    >
      <div className={`fixed inset-0 transition-opacity ${animate ? 'animate-overlay-in bg-[rgba(15,35,40,0.55)] motion-reduce:animate-none' : 'bg-navy-900/60'}`} onClick={() => closeRef.current()} />

      <div className={fluent ? 'flex min-h-full items-stretch justify-center sm:items-center sm:p-6' : 'flex min-h-full items-center justify-center p-4'}>
        <div className={panel} ref={panelRef}>
          <div className={`border-b border-border ${fluent ? 'px-5 py-4 sm:px-6' : 'px-6 py-4'}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              {icon}
              <div className="min-w-0">
                <h2 id={titleId} className={titleClassName ?? (fluent ? 'text-lg font-semibold text-ink' : 'text-base font-semibold text-navy-900')}>
                  {title}
                </h2>
                {subtitle && <p id={subtitleId} className="mt-0.5 text-sm text-muted">{subtitle}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => closeRef.current()}
              disabled={!dismissible}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Close"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {headerExtra}
          </div>

          <div className={fluent ? 'min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6' : 'px-6 py-5'}>{children}</div>

          {footer && (
            <div className={`border-t border-border bg-white ${fluent ? 'px-5 py-3.5 sm:px-6' : 'px-6 py-4'}`}>{footer}</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
