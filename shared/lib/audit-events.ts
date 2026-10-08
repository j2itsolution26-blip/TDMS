/**
 * The audit event catalogue: how each recorded action code is presented.
 *
 * PRESENTATION ONLY. Nothing here changes what is recorded, when, or under
 * which code: the audit_logs rows are untouched and every original code stays
 * visible in the event details. This module is the single place that decides
 * how a code reads ("Admin suspended"), which category it belongs to, and how
 * serious it is — so the list, the filters, the drawer and the export can never
 * disagree.
 *
 * It covers every code the application writes today AND the older names still
 * present in the database from earlier versions, so historic rows read as well
 * as new ones. A code missing from the table still displays — humanised, in
 * "Other", as routine activity — rather than disappearing.
 *
 * Pure and dependency-free, so the server (queries, export) and the browser
 * (drawer) share it.
 */

export type AuditSeverity = 'info' | 'activity' | 'warning' | 'security';

export type AuditCategory =
  | 'authentication'
  | 'password'
  | 'access_code'
  | 'admin_account'
  | 'user_account'
  | 'security'
  | 'system'
  | 'academic'
  | 'other';

interface EventMeta {
  label: string;
  category: AuditCategory;
  severity: AuditSeverity;
  /** An administrator acting on somebody else's account or credentials. */
  adminAction?: boolean;
}

/*
 * SEVERITY, and what decides it:
 *
 *   info      a routine, expected step (a code issued, a sign-in, an email sent)
 *   activity  a record was created or changed in the ordinary course of work
 *   warning   something was refused, failed or ran out
 *   security  a change to who can get in: suspension, reactivation, a password
 *             reset or reveal, a new Super Admin, an audit export
 */
const EVENTS: Record<string, EventMeta> = {
  // --- Authentication
  ADMIN_PASSWORD_ACCEPTED: { label: 'Password accepted', category: 'authentication', severity: 'info' },
  ADMIN_LOGIN_SUCCESS: { label: 'Admin signed in', category: 'authentication', severity: 'info' },
  ADMIN_LOGIN_FAILED: { label: 'Admin sign-in failed', category: 'authentication', severity: 'warning' },
  ACCOUNT_GOOGLE_LINKED: { label: 'Google account linked', category: 'authentication', severity: 'activity' },

  // --- Password
  TEMP_PASSWORD_GENERATED: { label: 'Temporary password generated', category: 'password', severity: 'info', adminAction: true },
  TEMP_PASSWORD_RESET: { label: 'Temporary password reset', category: 'password', severity: 'security', adminAction: true },
  TEMP_PASSWORD_REVEALED: { label: 'Temporary password revealed', category: 'password', severity: 'security', adminAction: true },
  ADMIN_TEMP_PASSWORD_CHANGED: { label: 'Admin set a permanent password', category: 'password', severity: 'activity' },
  TEMP_PASSWORD_CHANGED: { label: 'Permanent password set', category: 'password', severity: 'activity' },
  STAFF_PASSWORD_RESET: { label: 'Staff password reset', category: 'password', severity: 'security', adminAction: true },
  ACCOUNT_PASSWORD_RESET_COMPLETED: { label: 'Password reset completed', category: 'password', severity: 'activity' },
  // Older names for the same events.
  ADMIN_TEMPORARY_PASSWORD_CHANGED: { label: 'Admin set a permanent password', category: 'password', severity: 'activity' },
  ADMIN_TEMP_PASSWORD_REPLACED: { label: 'Admin set a permanent password', category: 'password', severity: 'activity' },
  TEMP_PASSWORD_USED: { label: 'Permanent password set', category: 'password', severity: 'activity' },
  ADMIN_PASSWORD_RESET: { label: 'Temporary password reset', category: 'password', severity: 'security', adminAction: true },
  ADMIN_TEMP_PASSWORD_RESET: { label: 'Temporary password reset', category: 'password', severity: 'security', adminAction: true },

  // --- Access codes
  ACCESS_CODE_GENERATED: { label: 'Access code generated', category: 'access_code', severity: 'info', adminAction: true },
  ACCESS_CODE_USED: { label: 'Access code used', category: 'access_code', severity: 'info' },
  ACCESS_CODE_REVOKED: { label: 'Access code revoked', category: 'access_code', severity: 'warning', adminAction: true },
  ACCESS_CODE_EXPIRED: { label: 'Access code expired', category: 'access_code', severity: 'warning' },
  ADMIN_ACCESS_CODE_REQUESTED: { label: 'Access code requested', category: 'access_code', severity: 'info' },
  ADMIN_ACCESS_CODE_GENERATED: { label: 'Access code generated', category: 'access_code', severity: 'info', adminAction: true },
  ADMIN_ACCESS_CODE_USED: { label: 'Access code used', category: 'access_code', severity: 'info' },
  ADMIN_ACCESS_CODE_EXPIRED: { label: 'Access code expired', category: 'access_code', severity: 'warning' },

  // --- Admin accounts
  ADMIN_CREATED: { label: 'Admin created', category: 'admin_account', severity: 'activity', adminAction: true },
  ADMIN_SUSPENDED: { label: 'Admin suspended', category: 'admin_account', severity: 'security', adminAction: true },
  ADMIN_REACTIVATED: { label: 'Admin reactivated', category: 'admin_account', severity: 'security', adminAction: true },

  // --- Staff and other user accounts
  STAFF_CREATED: { label: 'Staff account created', category: 'user_account', severity: 'activity', adminAction: true },
  ACCOUNT_UPDATED: { label: 'Account updated', category: 'user_account', severity: 'activity', adminAction: true },
  ACCOUNT_ACTIVE: { label: 'Account activated', category: 'user_account', severity: 'security', adminAction: true },
  ACCOUNT_INACTIVE: { label: 'Account deactivated', category: 'user_account', severity: 'security', adminAction: true },
  ACCOUNT_SUSPENDED: { label: 'Account suspended', category: 'user_account', severity: 'security', adminAction: true },
  ACCOUNT_PENDING: { label: 'Account set to pending', category: 'user_account', severity: 'security', adminAction: true },
  ACCOUNT_EMAIL_VERIFIED: { label: 'Email verified', category: 'user_account', severity: 'info' },
  ACCOUNT_ACTIVATED_VIA_GOOGLE: { label: 'Account activated via Google', category: 'user_account', severity: 'activity' },
  ACCOUNT_SELF_REGISTERED_VIA_GOOGLE: { label: 'Account registered via Google', category: 'user_account', severity: 'activity' },
  ACCOUNT_INVITED: { label: 'Staff invited', category: 'user_account', severity: 'activity', adminAction: true },
  ACCOUNT_VERIFICATION_RESENT: { label: 'Verification email resent', category: 'user_account', severity: 'info', adminAction: true },

  // --- System setup
  INITIAL_SUPER_ADMIN_CREATED: { label: 'Super Admin created', category: 'system', severity: 'security' },
  SUPER_ADMIN_VERIFICATION_CODE_SENT: { label: 'Setup verification code sent', category: 'system', severity: 'info' },
  SUPER_ADMIN_EMAIL_VERIFIED: { label: 'Super Admin email verified', category: 'system', severity: 'info' },

  // --- Security
  SUPER_ADMIN_VERIFICATION_ATTEMPTS_EXCEEDED: { label: 'Setup verification locked', category: 'security', severity: 'warning' },
  SUPER_ADMIN_SECURITY_CODE_REJECTED: { label: 'Security code rejected', category: 'security', severity: 'warning' },
  AUDIT_LOG_EXPORTED: { label: 'Audit log exported', category: 'security', severity: 'security' },

  // --- Academic (Diploma Instructor module)
  SCHOOL_YEAR_CREATED: { label: 'School year created', category: 'academic', severity: 'activity' },
  SCHOOL_YEAR_ACTIVATED: { label: 'School year activated', category: 'academic', severity: 'activity' },
  SCHOOL_YEAR_ARCHIVED: { label: 'School year archived', category: 'academic', severity: 'warning' },
  SCHOOL_YEAR_SEMESTER_CHANGED: { label: 'Current semester changed', category: 'academic', severity: 'activity' },
  SECTION_CREATED: { label: 'Section created', category: 'academic', severity: 'activity' },
  SECTION_RENAMED: { label: 'Section renamed', category: 'academic', severity: 'activity' },
  SECTION_DELETED: { label: 'Section deleted', category: 'academic', severity: 'activity' },
  SECTION_STUDENTS_ADDED: { label: 'Students added to section', category: 'academic', severity: 'activity' },
  SECTION_STUDENT_REMOVED: { label: 'Student removed from section', category: 'academic', severity: 'activity' },
  CLASS_CREATED: { label: 'Class created', category: 'academic', severity: 'activity' },
  CLASS_UPDATED: { label: 'Class updated', category: 'academic', severity: 'activity' },
  CLASS_DELETED: { label: 'Class deleted', category: 'academic', severity: 'activity' },
  ATTENDANCE_SESSION_OPENED: { label: 'Attendance session opened', category: 'academic', severity: 'info' },
  ATTENDANCE_SESSION_REOPENED: { label: 'Attendance session reopened', category: 'academic', severity: 'info' },
  ATTENDANCE_SESSION_CLOSED: { label: 'Attendance session closed', category: 'academic', severity: 'info' },
  ATTENDANCE_TIME_IN: { label: 'Attendance time-in recorded', category: 'academic', severity: 'info' },
  ATTENDANCE_TIME_OUT: { label: 'Attendance time-out recorded', category: 'academic', severity: 'info' },
  ATTENDANCE_MARKED: { label: 'Attendance changed manually', category: 'academic', severity: 'activity' },
  ASSESSMENT_CREATED: { label: 'Assessment created', category: 'academic', severity: 'activity' },
  ASSESSMENT_UPDATED: { label: 'Assessment updated', category: 'academic', severity: 'activity' },
  ASSESSMENT_DELETED: { label: 'Assessment deleted', category: 'academic', severity: 'activity' },
  ASSESSMENT_KEY_SAVED: { label: 'Answer key saved', category: 'academic', severity: 'activity' },
  ASSESSMENT_SCORES_SAVED: { label: 'Scores saved', category: 'academic', severity: 'activity' },
  ASSESSMENT_SHEET_CHECKED: { label: 'Answer sheet checked', category: 'academic', severity: 'info' },
  ASSESSMENT_SHEET_RECHECKED: { label: 'Answer sheet re-checked', category: 'academic', severity: 'activity' },
  ASSESSMENT_PUBLISHED: { label: 'Assessment published', category: 'academic', severity: 'activity' },
  ASSESSMENT_UNPUBLISHED: { label: 'Assessment unpublished', category: 'academic', severity: 'activity' },
  ASSESSMENT_FINALIZED: { label: 'Assessment results finalized', category: 'academic', severity: 'activity' },
  ASSESSMENT_RELEASED: { label: 'Assessment results released', category: 'academic', severity: 'activity' },
  ASSESSMENT_REOPENED: { label: 'Assessment results reopened', category: 'academic', severity: 'warning' },
  GRADEBOOK_WEIGHTS_CHANGED: { label: 'Grade weights changed', category: 'academic', severity: 'activity' },
  GRADEBOOK_REMARKS_SAVED: { label: 'Grade remarks saved', category: 'academic', severity: 'activity' },
  GRADEBOOK_FINALIZED: { label: 'Grades finalized', category: 'academic', severity: 'activity' },
  GRADEBOOK_RELEASED: { label: 'Grades released', category: 'academic', severity: 'activity' },
  GRADEBOOK_REOPENED: { label: 'Grades reopened', category: 'academic', severity: 'warning' },
  GRADEBOOK_EXPORTED: { label: 'Gradebook exported', category: 'academic', severity: 'info' },
  DOCUMENT_CREATED: { label: 'Academic document created', category: 'academic', severity: 'activity' },
  DOCUMENT_UPDATED: { label: 'Academic document updated', category: 'academic', severity: 'activity' },
  DOCUMENT_DELETED: { label: 'Academic document deleted', category: 'academic', severity: 'activity' },
  DOCUMENT_SUBMITTED: { label: 'Academic document submitted', category: 'academic', severity: 'activity' },
  DOCUMENT_REVIEW_STARTED: { label: 'Document review started', category: 'academic', severity: 'info' },
  DOCUMENT_APPROVED: { label: 'Academic document approved', category: 'academic', severity: 'activity' },
  DOCUMENT_RETURNED: { label: 'Academic document returned', category: 'academic', severity: 'activity' },
  STUDENT_STATUS_REQUESTED: { label: 'Student status change requested', category: 'academic', severity: 'activity' },
  STUDENT_STATUS_CHANGED: { label: 'Student status changed', category: 'academic', severity: 'security' },
  STUDENT_STATUS_REQUEST_REJECTED: { label: 'Student status request rejected', category: 'academic', severity: 'activity' },
  LEARNING_SUPPORT_CREATED: { label: 'Learning support recommended', category: 'academic', severity: 'activity' },
  LEARNING_SUPPORT_UPDATED: { label: 'Learning support updated', category: 'academic', severity: 'activity' },
  BADGE_AWARDED: { label: 'Badge awarded', category: 'academic', severity: 'info' },
  INSTRUCTOR_PROFILE_UPDATED: { label: 'Instructor PDS updated', category: 'academic', severity: 'activity' },
  INSTRUCTOR_PROFILE_VIEWED: { label: 'Instructor PDS viewed', category: 'academic', severity: 'security' },
  CALENDAR_EVENT_CREATED: { label: 'Calendar event created', category: 'academic', severity: 'activity' },
  CALENDAR_EVENT_UPDATED: { label: 'Calendar event updated', category: 'academic', severity: 'activity' },
  CALENDAR_EVENT_DELETED: { label: 'Calendar event deleted', category: 'academic', severity: 'activity' },
};

export const AUDIT_SEVERITIES: { value: AuditSeverity; label: string; description: string }[] = [
  { value: 'security', label: 'Security', description: 'Changes to who can get in' },
  { value: 'warning', label: 'Warning', description: 'Refused, failed or expired' },
  { value: 'activity', label: 'Activity', description: 'Records created or changed' },
  { value: 'info', label: 'Info', description: 'Routine steps' },
];

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  authentication: 'Authentication',
  password: 'Password',
  access_code: 'Access Code',
  admin_account: 'Admin Account',
  user_account: 'User Account',
  security: 'Security',
  system: 'System',
  academic: 'Academic',
  other: 'Other',
};

/** "ADMIN_SUSPENDED" -> "Admin suspended". The fallback for unknown codes. */
function humanise(code: string): string {
  const lower = code.replace(/_/g, ' ').toLowerCase().trim();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export interface AuditEventInfo extends EventMeta {
  code: string;
  known: boolean;
}

export function describeEvent(code: string): AuditEventInfo {
  const meta = EVENTS[code];
  return meta
    ? { code, known: true, ...meta }
    : { code, known: false, label: humanise(code), category: 'other', severity: 'activity' };
}

/** Every known code in a category / of a severity — for server-side filtering. */
export function codesInCategory(category: AuditCategory): string[] {
  return Object.entries(EVENTS).filter(([, m]) => m.category === category).map(([c]) => c);
}

export function codesWithSeverity(severity: AuditSeverity): string[] {
  return Object.entries(EVENTS).filter(([, m]) => m.severity === severity).map(([c]) => c);
}

export function adminActionCodes(): string[] {
  return Object.entries(EVENTS).filter(([, m]) => m.adminAction).map(([c]) => c);
}

/** All known codes — to find the ones "Other" means (everything else). */
export function knownCodes(): string[] {
  return Object.keys(EVENTS);
}

/** Codes whose readable name or code contains the search text. */
export function codesMatching(text: string): string[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return [];
  return Object.entries(EVENTS)
    .filter(([code, m]) => m.label.toLowerCase().includes(needle) || code.toLowerCase().includes(needle.replace(/\s+/g, '_')))
    .map(([code]) => code);
}

/** Categories that actually have events — an empty filter option helps nobody. */
export function usedCategories(): AuditCategory[] {
  const seen = new Set(Object.values(EVENTS).map((m) => m.category));
  return (Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[]).filter((c) => seen.has(c) || c === 'other');
}

// --- People ------------------------------------------------------------------------

export interface AuditParty {
  name: string;
  email: string | null;
  /** The text as stored, for the technical view. */
  raw: string;
}

const SYSTEM_ACTORS: Record<string, string> = {
  SELF_SERVICE: 'The account holder',
  GOOGLE_SIGN_IN: 'Google sign-in',
  SYSTEM: 'TDMS',
};

/**
 * Split the stored "Name <email>" into its parts. Rows written in other shapes
 * ("SELF_SERVICE", "Pending Super Admin (x@y)", "user #12") are shown as they
 * are, with any address found pulled out.
 */
export function parseParty(raw: string): AuditParty {
  const text = raw.trim();
  if (SYSTEM_ACTORS[text]) return { name: SYSTEM_ACTORS[text]!, email: null, raw };
  const angled = /^(.*)<([^<>\s]+@[^<>\s]+)>\s*$/.exec(text);
  if (angled) return { name: angled[1]!.trim() || angled[2]!, email: angled[2]!, raw };
  const bracketed = /^(.*)\(([^()\s]+@[^()\s]+)\)\s*$/.exec(text);
  if (bracketed) return { name: bracketed[1]!.trim() || bracketed[2]!, email: bracketed[2]!, raw };
  if (/^[^\s@]+@[^\s@]+$/.test(text)) return { name: text, email: text, raw };
  return { name: text, email: null, raw };
}

// --- Test data -----------------------------------------------------------------------

/**
 * Is this an address used only by automated tests?
 *
 * TDMS has no "test" flag on audit rows, and none is added: this is a DISPLAY
 * filter, and nothing is ever deleted. The rule is deliberately narrow and
 * principled rather than a guess:
 *
 *   * the reserved top-level domains .test, .example, .invalid and .localhost,
 *     and example.com / .net / .org — reserved by internet standards (RFC 2606,
 *     RFC 6761), so no real person can ever have an address there;
 *   * the "e2e-" prefix the automated test scripts used before they moved to
 *     the .test domain.
 */
export function isTestAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  const domain = lower.slice(lower.lastIndexOf('@') + 1);
  if (/\.(test|example|invalid|localhost)$/.test(domain)) return true;
  if (/^example\.(com|net|org)$/.test(domain)) return true;
  return lower.startsWith('e2e-');
}

/**
 * The same rule as SQL-able fragments. Every stored party ends in "…>" or "…)"
 * after its address, so a suffix match on the reserved domains is exact.
 */
export const TEST_ADDRESS_FRAGMENTS: string[] = [
  '.test>', '.example>', '.invalid>', '.localhost>',
  '@example.com>', '@example.net>', '@example.org>',
  '.test)', '.example)', '.invalid)',
  '<e2e-', '(e2e-',
];

// --- Details -------------------------------------------------------------------------

/**
 * A details key whose value must never be shown, even if a future writer
 * records one by mistake. No writer does today — passwords, codes, hashes and
 * keys are never put in an audit row — and this is the second line of defence.
 */
const SECRET_KEY = /(^|_)(password|passcode|pin|secret|token|hash|sealed|key|otp)$|^(code|access_code|temporary_password|static_code|security_code)$/;

const HIDDEN = 'Hidden';

type Formatter = (value: unknown) => string;

const yesNo: Formatter = (v) => (v === true ? 'Yes' : v === false ? 'No' : String(v));
const statusWord: Formatter = (v) => (typeof v === 'string' ? humanise(v) : String(v));
const count: Formatter = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : String(v));
const minutes: Formatter = (v) => (typeof v === 'number' ? `${v} minute${v === 1 ? '' : 's'}` : String(v));
const words: Formatter = (v) => (typeof v === 'string' ? humanise(v) : String(v));

const EMAIL_CONFIRMATION: Record<string, string> = {
  administrative: 'Confirmed by an administrator',
  already_confirmed: 'Already confirmed',
  unchanged: 'Unchanged',
};

/** Known detail keys: a readable label and how to show the value. */
const DETAIL_FIELDS: Record<string, { label: string; format?: Formatter }> = {
  from_status: { label: 'Previous status', format: statusWord },
  to_status: { label: 'New status', format: statusWord },
  previous_status: { label: 'Previous status', format: statusWord },
  status: { label: 'Status', format: statusWord },
  must_change_password: { label: 'Password change required', format: yesNo },
  password_change_required: { label: 'Password change required', format: yesNo },
  sessions_revoked: { label: 'Sessions revoked', format: yesNo },
  sessions_ended: { label: 'Sessions ended', format: count },
  access_codes_revoked: { label: 'Access codes revoked', format: count },
  previous_codes_revoked: { label: 'Earlier codes revoked', format: count },
  code_revoked: { label: 'Code revoked', format: yesNo },
  email_confirmation: { label: 'Email confirmation', format: (v) => EMAIL_CONFIRMATION[String(v)] ?? statusWord(v) },
  activated: { label: 'Account activated', format: yesNo },
  promoted_to_active: { label: 'Account activated', format: yesNo },
  role: { label: 'Role', format: words },
  old_role: { label: 'Previous role', format: words },
  new_role: { label: 'New role', format: words },
  old_email: { label: 'Previous email' },
  new_email: { label: 'New email' },
  code_id: { label: 'Access code ID' },
  credential_id: { label: 'Credential ID' },
  expires_in_minutes: { label: 'Valid for', format: minutes },
  expires_at: { label: 'Expires' },
  access_code_expires_at: { label: 'Access code expires' },
  access_code_issued: { label: 'Access code issued', format: yesNo },
  access_code_emailed: { label: 'Access code emailed', format: yesNo },
  emailed: { label: 'Emailed to the admin', format: yesNo },
  email_delivered: { label: 'Email delivered', format: yesNo },
  mail_delivered: { label: 'Email delivered', format: yesNo },
  mail_transport: { label: 'Mail service', format: words },
  reason: { label: 'Reason', format: words },
  attempts_used: { label: 'Attempts used', format: count },
  revealable: { label: 'Can be shown again', format: yesNo },
  new_temporary_password_revealable: { label: 'New password can be shown again', format: yesNo },
  replaced_temporary_password: { label: 'Replaced a temporary password', format: yesNo },
  temporary_credential_consumed: { label: 'Temporary credential destroyed', format: yesNo },
  second_factor: { label: 'Second factor', format: words },
  awaiting: { label: 'Waiting for', format: words },
  super_admins_notified: { label: 'Super Admins notified', format: yesNo },
  recipients: { label: 'Recipients', format: count },
  attempted_action: { label: 'Attempted action', format: (v) => (typeof v === 'string' ? describeEvent(v).label : String(v)) },
  rows: { label: 'Rows exported', format: count },
  filters: { label: 'Filters' },
};

export interface DetailField {
  key: string;
  label: string;
  value: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function formatValue(key: string, value: unknown, formatDateTime: (iso: string) => string): string {
  if (SECRET_KEY.test(key) && typeof value === 'string') return HIDDEN;
  const known = DETAIL_FIELDS[key];
  if (typeof value === 'string' && ISO_DATE.test(value)) return formatDateTime(value);
  if (known?.format) return known.format(value);
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return yesNo(value);
  if (typeof value === 'number') return count(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Structured details: every key the row has, labelled and formatted, known
 * ones first. Nothing is dropped — an unknown key gets a humanised label.
 */
export function formatDetails(
  details: Record<string, unknown> | null | undefined,
  formatDateTime: (iso: string) => string = (iso) => iso,
): DetailField[] {
  if (!details) return [];
  const entries = Object.entries(details);
  const known = entries.filter(([k]) => DETAIL_FIELDS[k]);
  const unknown = entries.filter(([k]) => !DETAIL_FIELDS[k]);
  return [...known, ...unknown].map(([key, value]) => ({
    key,
    label: DETAIL_FIELDS[key]?.label ?? humanise(key),
    value: formatValue(key, value, formatDateTime),
  }));
}

/**
 * The details as stored, with any secret-shaped value masked — for the
 * "View technical details" disclosure.
 */
export function redactedDetails(details: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!details) return null;
  return Object.fromEntries(
    Object.entries(details).map(([k, v]) => [k, SECRET_KEY.test(k) && typeof v === 'string' ? HIDDEN : v]),
  );
}

/**
 * The one or two facts worth showing on the row itself; the rest are in the
 * drawer. A status change reads as "Active → Suspended".
 */
export function highlights(
  details: Record<string, unknown> | null | undefined,
  formatDateTime: (iso: string) => string = (iso) => iso,
): DetailField[] {
  if (!details) return [];
  const out: DetailField[] = [];
  const from = details.from_status;
  const to = details.to_status;
  if (typeof from === 'string' && typeof to === 'string') {
    out.push({ key: 'status_change', label: 'Status changed', value: `${statusWord(from)} → ${statusWord(to)}` });
  }
  const PRIORITY = [
    'reason', 'access_codes_revoked', 'previous_codes_revoked', 'expires_in_minutes', 'role',
    'new_role', 'email_confirmation', 'attempts_used', 'rows',
  ];
  for (const key of PRIORITY) {
    if (out.length >= 2) break;
    if (!(key in details)) continue;
    const field = formatDetails({ [key]: details[key] }, formatDateTime)[0]!;
    out.push(field);
  }
  return out;
}
