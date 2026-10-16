/**
 * The rules behind the confirmation dialog (components/ConfirmDialog.tsx),
 * kept free of React so they can be tested on their own.
 *
 * A confirmed action runs at most once at a time: a second click on Confirm,
 * or Enter held down, while the request is in flight is ignored rather than
 * sent again. The action reports its own outcome as a boolean — API results
 * carry arbitrary data, so "truthy" is not a safe stand-in for "succeeded" —
 * and an action that throws counts as failed, never as done.
 */

export type ConfirmOutcome = 'succeeded' | 'failed' | 'ignored';

export function singleFlight(action: () => Promise<boolean>): () => Promise<ConfirmOutcome> {
  let running = false;
  return async () => {
    if (running) return 'ignored';
    running = true;
    try {
      return (await action()) ? 'succeeded' : 'failed';
    } catch {
      return 'failed';
    } finally {
      running = false;
    }
  };
}

/** While the action runs, Cancel, ×, Escape and the backdrop do nothing: the request is already on its way. */
export function canDismiss(pending: boolean): boolean {
  return !pending;
}

export type ConfirmDetail = { label: string; value: string | number | null | undefined };

/** Only details the record actually has; an empty value is left out rather than shown as a blank row. */
export function presentDetails(details: readonly ConfirmDetail[] | undefined): { label: string; value: string }[] {
  return (details ?? [])
    .filter((d) => d.value !== null && d.value !== undefined && String(d.value).trim() !== '')
    .map((d) => ({ label: d.label, value: String(d.value).trim() }));
}
