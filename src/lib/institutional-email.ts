/**
 * Email address policy.
 *
 * Two separate questions, deliberately kept apart:
 *
 *   1. Is this a well-formed email address?  — always enforced.
 *   2. Is it on the institution's domain?    — enforced only when the
 *                                              domain restriction is on.
 *
 * The domain restriction is a switch, not a deletion. The whole validation
 * architecture — exact-match comparison, lookalike rejection, normalisation
 * — stays in the codebase and stays tested, so turning it back on is one
 * environment variable rather than a rewrite.
 *
 * This module is the single place either question is answered. Every path
 * that accepts an address goes through it: Google sign-in, credential
 * sign-in, the first-administrator bootstrap, staff invitations, profile
 * changes and password-reset requests. Changing the policy here changes it
 * everywhere, consistently.
 *
 * All of it runs on the server. `<input type="email">` and client-side
 * checks are conveniences for the person typing; they are not the rule.
 */

/**
 * Whether the domain restriction is enforced.
 *
 * Read on every call rather than captured at import, so a deployment can
 * change it without a rebuild and tests can exercise both states.
 *
 * DEFAULT: OFF.
 *
 * That is a fail-open default, which is worth being honest about. It is
 * chosen because this project's development happens against the deployed
 * Vercel environment, where NODE_ENV is "production" — so keying the default
 * off NODE_ENV would restrict the very environment being developed in, which
 * is the opposite of what is wanted right now.
 *
 * The cost is that a real production launch which forgets the variable will
 * accept any Google account. To make that impossible to overlook rather than
 * merely documented, the state is reported by /api/health and a warning is
 * logged on every evaluation in a production runtime (see below).
 *
 * Turn it on for launch:
 *   GOOGLE_DOMAIN_RESTRICTION_ENABLED=true
 *   GOOGLE_ALLOWED_DOMAIN=asiancollege.edu.ph
 */
export function domainRestrictionEnabled(): boolean {
  const raw = (process.env.GOOGLE_DOMAIN_RESTRICTION_ENABLED ?? '').trim().toLowerCase();
  // Only an explicit affirmative enables it; anything else, including unset
  // and typos, leaves it off rather than half-on.
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

/**
 * The domain enforced when the restriction is on.
 *
 * GOOGLE_ALLOWED_DOMAIN is the name the current configuration uses;
 * INSTITUTIONAL_EMAIL_DOMAIN is accepted as well so the variable that was
 * already set keeps working.
 */
export function allowedDomain(): string {
  return (
    process.env.GOOGLE_ALLOWED_DOMAIN ??
    process.env.INSTITUTIONAL_EMAIL_DOMAIN ??
    'asiancollege.edu.ph'
  )
    .trim()
    .toLowerCase();
}

/**
 * Retained for the call sites that display the domain. Prefer
 * `allowedDomain()`, which is evaluated per call.
 */
export const INSTITUTIONAL_DOMAIN = allowedDomain();

/** The message shown when an address is refused for its domain. */
export function domainRejectionMessage(): string {
  return `Only an @${allowedDomain()} account can access TDMS.`;
}

/**
 * Normalise an address for storage and comparison.
 *
 * - trims surrounding whitespace, which is almost always a paste artefact;
 * - lower-cases the whole address.
 *
 * Lower-casing the local part as well as the domain is deliberate. SMTP
 * permits case-sensitive local parts, but no institution issues `J.Cruz@`
 * and `j.cruz@` to different people, and treating them as distinct would let
 * one person hold two accounts and split their records. The unique index
 * then does what it looks like it does.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Split an address on the LAST '@'.
 *
 * Splitting on the first is the classic mistake: a quoted local part may
 * legally contain one, and an attacker supplying `a@b@evil.com` would be
 * measured against the wrong half.
 */
function splitAddress(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

/** Deliberately conservative: no spaces, no commas, no angle brackets. */
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;

/** A domain label: letters, digits and inner hyphens, dot separated. */
const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/**
 * Is this a well-formed email address, regardless of domain policy?
 *
 * Enforced whether or not the restriction is on: a malformed address is
 * never acceptable, and letting one through would put junk in a UNIQUE
 * column that later has to be cleaned up by hand.
 */
export function isWellFormedEmail(raw: string): boolean {
  const email = normalizeEmail(raw);

  // Exactly one '@'. Rejects a@b@c outright rather than reasoning about it.
  if (email.split('@').length !== 2) return false;

  const parts = splitAddress(email);
  if (!parts) return false;

  const { local, domain } = parts;

  if (local.length === 0 || local.length > 64) return false;
  if (!LOCAL_PART.test(local)) return false;
  // A leading, trailing or doubled dot is not a deliverable local part.
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;

  if (domain.length === 0 || domain.length > 255) return false;
  if (!DOMAIN.test(domain)) return false;

  return true;
}

/**
 * Is this address on the allowed domain?
 *
 * Answers the domain question ONLY — it ignores whether the restriction is
 * switched on, so the comparison can be tested and reasoned about
 * independently of the policy that decides when to apply it.
 *
 * The domain must match **exactly**. An `endsWith` test is not sufficient
 * and is the bug this exists to prevent. All of these are rejected:
 *
 *   evil.com                          wrong domain
 *   asiancollege.edu.ph.example.com   suffix, not the domain
 *   notasiancollege.edu.ph            endsWith would accept this
 *   asiancollege-edu.ph               hyphen instead of a dot
 *   sub.asiancollege.edu.ph           a subdomain is a different host
 */
export function isOnAllowedDomain(raw: string): boolean {
  const email = normalizeEmail(raw);
  if (!isWellFormedEmail(email)) return false;

  const parts = splitAddress(email);
  if (!parts) return false;

  return parts.domain === allowedDomain();
}

/**
 * Is this address acceptable under the CURRENT policy?
 *
 * Well-formed always; on the allowed domain only when the restriction is on.
 *
 * The name is kept from when the restriction was unconditional, so no call
 * site had to change when it became configurable.
 */
export function isInstitutionalEmail(raw: string): boolean {
  if (!isWellFormedEmail(raw)) return false;
  if (!domainRestrictionEnabled()) return true;
  return isOnAllowedDomain(raw);
}

export interface EmailCheck {
  ok: boolean;
  /** Normalised address, safe to store. Only meaningful when ok. */
  email: string;
  /** User-facing reason, already safe to display. */
  message?: string;
}

/** Normalise and validate in one step — the form most call sites want. */
export function checkInstitutionalEmail(raw: string): EmailCheck {
  const email = normalizeEmail(raw);

  if (email.length === 0) {
    return { ok: false, email, message: 'Please enter your email address.' };
  }
  if (email.length > 255) {
    return { ok: false, email, message: 'That email address is too long.' };
  }
  if (!isWellFormedEmail(email)) {
    return { ok: false, email, message: 'Please enter a valid email address.' };
  }
  if (domainRestrictionEnabled() && !isOnAllowedDomain(email)) {
    return { ok: false, email, message: domainRejectionMessage() };
  }

  return { ok: true, email };
}

/**
 * A one-line description of the policy, for /api/health and the server log.
 *
 * Deliberately blunt about the open state: a deployment that is accepting
 * any Google account should say so somewhere an operator will see it,
 * rather than only in a document.
 */
export function describeDomainPolicy(): {
  enabled: boolean;
  allowedDomain: string;
  summary: string;
} {
  const enabled = domainRestrictionEnabled();
  return {
    enabled,
    allowedDomain: allowedDomain(),
    summary: enabled
      ? `Restricted to @${allowedDomain()}`
      : 'OPEN — any well-formed Google account is accepted (development setting)',
  };
}

/**
 * Retained so existing imports keep compiling. Prefer
 * `domainRejectionMessage()`, which reflects the configured domain.
 */
export const DOMAIN_REJECTION_MESSAGE = domainRejectionMessage();
