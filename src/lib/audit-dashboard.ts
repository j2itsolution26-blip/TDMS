/**
 * How the Super Admin DASHBOARD summarises the audit trail.
 *
 * The dashboard is a summary: a short, human list of what happened, to whom,
 * when, and whether it needs attention. The Audit Logs page remains the full
 * technical record — codes, both parties, email addresses, IP, user agent and
 * every stored detail — and nothing here changes what is recorded.
 *
 * Two panels, two closed lists of event codes:
 *
 *   System Activity  account, access and administrative changes
 *   Security         sign-ins, credentials and refusals, each with a status
 *
 * A code in neither list is simply not summarised (it is still on the Audit
 * Logs page). ADMIN_PASSWORD_ACCEPTED is deliberately left out: it is the
 * first half of an Admin's initial sign-in, always followed by an access-code
 * event that says how the sign-in ended, so on its own it only ever read as
 * "Step 1 of 2".
 *
 * Pure and dependency-free, so it can be unit-tested.
 */

export type SummaryTone = 'success' | 'attention' | 'failed' | 'expired' | 'info';

/** Which side of the audit row the dashboard names as "the person". */
type Subject = 'target' | 'actor';

export interface SummaryEvent {
  label: string;
  subject: Subject;
  status?: { tone: SummaryTone; label: string };
}

const SUCCESS = { tone: 'success', label: 'Success' } as const;
const FAILED = { tone: 'failed', label: 'Failed' } as const;
const EXPIRED = { tone: 'expired', label: 'Expired' } as const;

/**
 * Account, access and administrative activity. The person shown is the one
 * the change was made TO — "Admin account created · James Tan" — except where
 * the change has no personal target (an audit export), which shows who did it.
 */
export const SYSTEM_ACTIVITY_EVENTS: Record<string, SummaryEvent> = {
  ADMIN_CREATED: { label: 'Admin account created', subject: 'target' },
  ADMIN_SUSPENDED: { label: 'Administrator account suspended', subject: 'target' },
  ADMIN_REACTIVATED: { label: 'Admin account activated', subject: 'target' },
  ACCESS_CODE_GENERATED: { label: 'Access code generated', subject: 'target' },
  ADMIN_ACCESS_CODE_GENERATED: { label: 'Access code generated', subject: 'target' },
  ACCESS_CODE_REVOKED: { label: 'Access code revoked', subject: 'target' },
  TEMP_PASSWORD_GENERATED: { label: 'Temporary password issued', subject: 'target' },
  TEMP_PASSWORD_REVEALED: { label: 'Temporary password issued', subject: 'target' },
  TEMP_PASSWORD_RESET: { label: 'Temporary password changed', subject: 'target' },
  // Older names for the same reset.
  ADMIN_PASSWORD_RESET: { label: 'Temporary password changed', subject: 'target' },
  ADMIN_TEMP_PASSWORD_RESET: { label: 'Temporary password changed', subject: 'target' },
  STAFF_CREATED: { label: 'Staff account created', subject: 'target' },
  STAFF_PASSWORD_RESET: { label: 'Staff password reset', subject: 'target' },
  ACCOUNT_ACTIVE: { label: 'Account activated', subject: 'target' },
  ACCOUNT_INACTIVE: { label: 'Account deactivated', subject: 'target' },
  ACCOUNT_SUSPENDED: { label: 'Account suspended', subject: 'target' },
  INITIAL_SUPER_ADMIN_CREATED: { label: 'Super Admin account created', subject: 'target' },
  AUDIT_LOG_EXPORTED: { label: 'Audit log exported', subject: 'actor' },
};

/**
 * Security events, each with a status that says in a word whether it needs
 * attention. Every one of these is written with the account holder as both
 * actor and target, except a suspension (the Admin suspended is the target).
 */
export const SECURITY_EVENTS: Record<string, SummaryEvent & { status: NonNullable<SummaryEvent['status']> }> = {
  ADMIN_LOGIN_SUCCESS: { label: 'Successful administrator login', subject: 'target', status: SUCCESS },
  ADMIN_LOGIN_FAILED: { label: 'Administrator login failed', subject: 'target', status: FAILED },
  ACCESS_CODE_USED: { label: 'Access code used', subject: 'target', status: SUCCESS },
  ADMIN_ACCESS_CODE_USED: { label: 'Access code used', subject: 'target', status: SUCCESS },
  ACCESS_CODE_EXPIRED: { label: 'Access code expired', subject: 'target', status: EXPIRED },
  ADMIN_ACCESS_CODE_EXPIRED: { label: 'Access code expired', subject: 'target', status: EXPIRED },
  ADMIN_ACCESS_CODE_REQUESTED: { label: 'Access code requested', subject: 'target', status: { tone: 'attention', label: 'Needs a code' } },
  ADMIN_SUSPENDED: { label: 'Suspended administrator account', subject: 'target', status: { tone: 'attention', label: 'Suspended' } },
  ADMIN_TEMP_PASSWORD_CHANGED: { label: 'Temporary password changed', subject: 'target', status: SUCCESS },
  TEMP_PASSWORD_CHANGED: { label: 'Temporary password changed', subject: 'target', status: SUCCESS },
  // Older names for the same change.
  ADMIN_TEMPORARY_PASSWORD_CHANGED: { label: 'Temporary password changed', subject: 'target', status: SUCCESS },
  ADMIN_TEMP_PASSWORD_REPLACED: { label: 'Temporary password changed', subject: 'target', status: SUCCESS },
  TEMP_PASSWORD_USED: { label: 'Temporary password changed', subject: 'target', status: SUCCESS },
  ACCOUNT_PASSWORD_RESET_COMPLETED: { label: 'Password reset completed', subject: 'target', status: SUCCESS },
  SUPER_ADMIN_SECURITY_CODE_REJECTED: { label: 'Security code rejected', subject: 'actor', status: FAILED },
  SUPER_ADMIN_VERIFICATION_ATTEMPTS_EXCEEDED: { label: 'Too many verification attempts', subject: 'actor', status: FAILED },
};

/** The Badge vocabulary each tone maps to: green, amber, red, red, blue. */
export const TONE_BADGE_STATUS: Record<SummaryTone, string> = {
  success: 'success',
  attention: 'pending',
  failed: 'failed',
  expired: 'expired',
  info: 'information',
};

/**
 * The role as the dashboard names it. "Administrator" rather than the
 * sidebar's short "Admin", as a person's title reads in a sentence.
 */
export function dashboardRoleLabel(role: string | null): string | null {
  if (!role) return null;
  const labels: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Administrator',
    director: 'Director',
    coordinator: 'Coordinator',
    secretary: 'Secretary',
    teacher: 'Teacher',
    student: 'Student',
  };
  return labels[role] ?? null;
}

/** "James Tan · Administrator", or just the name when the role is unknown. */
export function personLine(name: string, role: string | null): string {
  return role ? `${name} · ${role}` : name;
}
