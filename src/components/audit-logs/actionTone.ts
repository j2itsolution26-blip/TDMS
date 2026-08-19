import type { StatusTone } from "@/components/ui/StatusBadge";

export function formatActionLabel(action: string): string {
  return action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Pattern-based, not a per-action lookup table — a brand-new action name
 * (STAFF_ACCOUNT_DELETED, ROLE_CREATED, whatever comes next) gets a
 * sensible tone automatically instead of silently falling through to
 * "neutral" until someone remembers to register it.
 */
export function actionTone(action: string): StatusTone {
  const a = action.toUpperCase();
  if (/(FAILED|DELETED|REJECTED|DENIED)/.test(a)) return "danger";
  if (/(DEACTIVATED|WARN|SUSPENDED)/.test(a)) return "warning";
  if (/(SUCCESS|CREATED|ACTIVATED|APPROVED|VERIFIED|ENROLLED)$/.test(a) && !/DEACTIVATED/.test(a)) return "success";
  if (/(UPDATED|CHANGED|LOGOUT|VIEW)/.test(a)) return "info";
  return "neutral";
}
