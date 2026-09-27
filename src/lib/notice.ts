/**
 * Notices that carry their own tone.
 *
 * A screen used to hold its notice as a bare string and render it as a
 * success alert, so "Could not send the email" arrived in green with a tick.
 * A notice is now a tone plus text, and the failure builders below are the
 * only way to make one, which keeps the styling honest by construction.
 */

export type NoticeTone = 'success' | 'warning';

export type Notice = { tone: NoticeTone; text: string };

/** A plain confirmation. */
export function succeeded(text: string): Notice {
  return { tone: 'success', text: ensureStop(text) };
}

/**
 * "Could not send" plus whatever the mail provider said.
 *
 * Provider details usually end in a full stop already, so appending one
 * unconditionally produced "…to email anybody else..".
 */
export function undelivered(lead: string, detail?: string): Notice {
  const trimmed = detail?.trim();
  const text = trimmed ? `${lead} — ${trimmed}` : lead;
  return { tone: 'warning', text: ensureStop(text) };
}

function ensureStop(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
