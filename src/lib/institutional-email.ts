/**
 * The institutional email rule.
 *
 * TDMS accounts must be on the college's own domain. This module is the only
 * place that decides what that means, and it is used by every path that
 * accepts an address: registration, the first-administrator bootstrap, staff
 * account creation, profile changes and sign-in.
 *
 * It runs on the server. `<input type="email">` and client-side checks are
 * conveniences for the person typing; they are not the rule.
 */

/** Configurable so a second campus domain can be added without code changes. */
export const INSTITUTIONAL_DOMAIN = (
  process.env.INSTITUTIONAL_EMAIL_DOMAIN ?? 'asiancollege.edu.ph'
).toLowerCase();

export const DOMAIN_REJECTION_MESSAGE =
  `Only an @${INSTITUTIONAL_DOMAIN} account can access TDMS.`;

/**
 * Normalise an address for storage and comparison.
 *
 * - trims surrounding whitespace, which is almost always a paste artefact;
 * - lower-cases the whole address.
 *
 * Lower-casing the local part as well as the domain is a deliberate choice.
 * SMTP permits case-sensitive local parts, but no institution issues
 * `J.Cruz@` and `j.cruz@` to different people, and treating them as distinct
 * would let two accounts exist for one person and quietly split their
 * records. The unique index then does what it looks like it does.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Split an address into local part and domain on the LAST '@'.
 *
 * Splitting on the first '@' is the classic mistake: a quoted local part may
 * legally contain one, and an attacker supplying `a@b@evil.com` would be
 * measured against the wrong half.
 */
function splitAddress(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

/** Deliberately conservative: no spaces, no commas, no angle brackets, one @. */
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;

/**
 * Is this an address on the institutional domain?
 *
 * The domain must equal the institutional domain **exactly** — an
 * `endsWith` test is not sufficient and is the bug this function exists to
 * prevent. All of the following are rejected:
 *
 *   evil.com                              (wrong domain)
 *   asiancollege.edu.ph.example.com       (suffix, not the domain)
 *   notasiancollege.edu.ph                (endsWith would accept this)
 *   asiancollege-edu.ph                   (hyphen instead of dot)
 *   asiancollege.edu.ph.fake.com          (domain buried in a longer name)
 *   sub.asiancollege.edu.ph               (a subdomain is a different host)
 *
 * The expected input is a normalised address; normalisation is applied again
 * defensively so a caller that forgets cannot create a hole.
 */
export function isInstitutionalEmail(raw: string): boolean {
  const email = normalizeEmail(raw);

  // One '@' only. Rejects a@b@c outright rather than reasoning about it.
  if (email.split('@').length !== 2) return false;

  const parts = splitAddress(email);
  if (!parts) return false;

  const { local, domain } = parts;

  if (local.length === 0 || local.length > 64) return false;
  if (!LOCAL_PART.test(local)) return false;
  // A leading, trailing or doubled dot is not a deliverable local part.
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;

  // Exact match. Not endsWith, not includes.
  return domain === INSTITUTIONAL_DOMAIN;
}

export interface EmailCheck {
  ok: boolean;
  /** Normalised address, safe to store. Only meaningful when ok. */
  email: string;
  /** User-facing reason, already safe to display. */
  message?: string;
}

/**
 * Normalise and validate in one step — the form most call sites want.
 */
export function checkInstitutionalEmail(raw: string): EmailCheck {
  const email = normalizeEmail(raw);

  if (email.length === 0) {
    return { ok: false, email, message: 'Please enter your institutional email address.' };
  }
  if (email.length > 255) {
    return { ok: false, email, message: 'That email address is too long.' };
  }
  if (!isInstitutionalEmail(email)) {
    return { ok: false, email, message: DOMAIN_REJECTION_MESSAGE };
  }

  return { ok: true, email };
}
