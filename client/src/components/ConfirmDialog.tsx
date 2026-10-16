import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import Modal from '@/components/Modal';
import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/ui';
import { canDismiss, presentDetails, singleFlight, type ConfirmDetail } from '@/lib/confirm';

/**
 * The one confirmation dialog for TDMS, in place of window.confirm().
 *
 * It asks before something consequential happens; it does not report the
 * result (that is a notice on the page, or a toast below). Two ways to use it:
 *
 *   const confirm = useConfirm();
 *   await confirm({ tone: 'danger', title: 'Delete draft?', confirmLabel: 'Delete draft',
 *                   action: async () => (await run(() => api.del(url))) !== null });
 *
 *   <ConfirmDialog open={…} onCancel={…} onConfirm={…} pending={busy} … />
 *
 * Nothing runs until Confirm is pressed. Cancel, ×, Escape and the backdrop
 * only close. While the action is in flight the dialog cannot be dismissed
 * and Confirm cannot be pressed again; it closes when the action succeeds.
 * When it fails it closes too, and the screen's own error notice says why —
 * the place that error has always appeared. Focus starts on Cancel, the safe
 * choice, and returns to the button that opened the dialog.
 *
 * Confirmation is a courtesy, not a safeguard: every one of these requests
 * is authorised again on the server.
 */

export type ConfirmTone = 'danger' | 'warning' | 'success' | 'info';

export interface ConfirmContent {
  title: string;
  /** One or two sentences: what will happen, and what cannot be undone. */
  description?: ReactNode;
  /** Facts about the record, shown as a short list. Empty values are left out. */
  details?: ConfirmDetail[];
  /** danger: red, for deleting or removing. success: emerald, for approving. warning: amber, for locking or closing. */
  tone?: ConfirmTone;
  /** Replaces the tone's icon. */
  icon?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Shown on the confirm button while the action runs, e.g. "Deleting…". */
  pendingLabel?: string;
}

const TONE: Record<ConfirmTone, { tile: string; Icon: typeof Info }> = {
  danger: { tile: 'bg-red-50 text-red-600 ring-red-200', Icon: TriangleAlert },
  warning: { tile: 'bg-amber-50 text-amber-700 ring-amber-200', Icon: TriangleAlert },
  success: { tile: 'bg-primary-50 text-primary-700 ring-primary-200', Icon: CircleCheck },
  info: { tile: 'bg-blue-50 text-blue-700 ring-blue-200', Icon: Info },
};

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  pending = false,
  error,
  title,
  description,
  details,
  tone = 'warning',
  icon,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  pendingLabel = 'Working…',
}: ConfirmContent & {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
  /** A failure to show inside the dialog, for screens that keep it open to retry. */
  error?: ReactNode;
}) {
  const descriptionId = useId();
  const { tile, Icon } = TONE[tone];
  const rows = presentDetails(details);
  // Not autoFocus: that fires before Modal notes which button opened the
  // dialog, and focus would then return to Cancel instead of to that button.
  // This effect runs after Modal's (a parent's effects follow its children's).
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) cancelRef.current?.focus(); }, [open]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      dismissible={canDismiss(pending)}
      title={title}
      role="alertdialog"
      describedBy={description || rows.length ? descriptionId : undefined}
      maxWidth="sm:max-w-md"
      titleClassName="text-base font-semibold text-ink"
      icon={
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ring-inset ${tile}`} aria-hidden="true">
          {icon ?? <Icon className="h-5 w-5" />}
        </span>
      }
      trapFocus
      animate
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" ref={cancelRef} className={BUTTON_SECONDARY} onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === 'danger' ? BUTTON_DANGER : BUTTON_PRIMARY}
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending && <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      }
    >
      <div id={descriptionId} className="space-y-4">
        {description && <div className="text-sm leading-relaxed text-muted">{description}</div>}
        {rows.length > 0 && (
          <dl className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
            {rows.map((r) => (
              <div key={r.label} className="flex gap-3 px-3.5 py-2">
                <dt className="w-28 shrink-0 text-muted">{r.label}</dt>
                <dd className="min-w-0 break-words font-medium text-ink">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {error && (
          <p role="alert" className="flex gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-800 ring-1 ring-inset ring-red-200">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </Modal>
  );
}

// --- The imperative form: useConfirm() -------------------------------------------------------

export interface ConfirmRequest extends ConfirmContent {
  /** Runs on Confirm; resolve true when it succeeded. Without it, Confirm just closes and resolves true. */
  action?: () => Promise<boolean>;
  /** A toast once the action has succeeded, for screens with no notice of their own. */
  success?: string;
}

type Pending = ConfirmRequest & { resolve: (confirmed: boolean) => void };

type ToastTone = 'success' | 'error';
type Toast = { id: number; tone: ToastTone; text: string };

const ConfirmContext = createContext<((request: ConfirmRequest) => Promise<boolean>) | null>(null);
const ToastContext = createContext<((text: string, tone?: ToastTone) => void) | null>(null);

/** Resolves true once the person has confirmed and the action (if any) succeeded; false otherwise. */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm needs <ConfirmProvider> (see App.tsx).');
  return confirm;
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast needs <ConfirmProvider> (see App.tsx).');
  return toast;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Pending | null>(null);
  const [pending, setPending] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToast = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((text: string, tone: ToastTone = 'success') => {
    const id = ++nextToast.current;
    setToasts((list) => [...list.slice(-2), { id, tone, text }]);
    timers.current.set(id, setTimeout(() => dismissToast(id), 5000));
  }, [dismissToast]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const confirm = useCallback((next: ConfirmRequest) => new Promise<boolean>((resolve) => {
    // A second request replaces one still waiting; the first counts as cancelled.
    setRequest((current) => { current?.resolve(false); return { ...next, resolve }; });
  }), []);

  // One runner per request, so a double click cannot send the request twice.
  const run = useMemo(() => {
    const action = request?.action;
    return singleFlight(async () => (action ? action() : true));
  }, [request]);

  const close = useCallback((confirmed: boolean) => {
    setRequest((current) => { current?.resolve(confirmed); return null; });
  }, []);

  async function onConfirm() {
    if (!request) return;
    setPending(true);
    const outcome = await run();
    if (outcome === 'ignored') return;
    setPending(false);
    if (outcome === 'succeeded' && request.success) toast(request.success);
    close(outcome === 'succeeded');
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      <ToastContext.Provider value={toast}>
        {children}
        <ConfirmDialog
          {...request}
          title={request?.title ?? ''}
          open={request !== null}
          pending={pending}
          onCancel={() => { if (canDismiss(pending)) close(false); }}
          onConfirm={() => void onConfirm()}
        />
        {createPortal(
          <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:right-5 sm:w-96" aria-live="polite">
            {toasts.map((t) => (
              <div
                key={t.id}
                role={t.tone === 'error' ? 'alert' : 'status'}
                className="pointer-events-auto flex w-full animate-modal-in items-start gap-3 rounded-xl border border-border bg-white p-3.5 text-sm text-ink shadow-soft-lg motion-reduce:animate-none"
              >
                {t.tone === 'success'
                  ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
                  : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />}
                <p className="min-w-0 flex-1">{t.text}</p>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  className="-m-1 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
      </ToastContext.Provider>
    </ConfirmContext.Provider>
  );
}
