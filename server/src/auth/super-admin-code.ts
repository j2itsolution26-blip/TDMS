import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * The static Super Admin security code.
 *
 * A SECOND, DIFFERENT THING from the generated Admin access code, and the
 * distinction is the whole point of this module existing separately:
 *
 *   * THIS code is one long-lived secret held by the system owner, supplied
 *     through the environment, and required before a Super Admin may issue
 *     credentials to somebody else — create an Admin, mint an access code,
 *     reset a temporary password. It is a confirmation that the person at
 *     the keyboard is the owner and not a borrowed session.
 *
 *   * The ACCESS code (src/server/auth/admin-access-code.ts) is short-lived,
 *     generated per Admin, single use, and is what an Admin types to finish
 *     signing in.
 *
 * Using one for the other would collapse them into a shared password, so
 * nothing here is ever accepted at the Admin sign-in step and nothing there
 * is ever accepted here.
 *
 * WHERE IT LIVES, AND WHERE IT MUST NOT
 *
 * `SUPER_ADMIN_STATIC_CODE`, read on the server only. This file lives under
 * server/, which the browser build cannot import from (client/vite.config.ts
 * has no alias for it), so a mistaken import is a build error rather than a
 * leak. The variable is deliberately NOT prefixed
 * `TDMS_PUBLIC_`, the only prefix Vite inlines into the browser bundle.
 *
 * It is never: hard-coded, stored in the database, returned by an API,
 * rendered, logged, or included in an audit record. The only thing that ever
 * crosses a boundary about it is whether it is configured, and whether a
 * submitted value matched.
 *
 * NO DEFAULT
 *
 * There is no fallback value, and an unset variable does not mean "allow".
 * The privileged operations refuse outright until the owner supplies one.
 * Inventing a default would mean shipping a production system whose master
 * confirmation code is in a public git history.
 */

const VARIABLE = 'SUPER_ADMIN_STATIC_CODE';

/**
 * The configured value, or null.
 *
 * Read per call rather than captured at import, so a deployment can set it
 * without a rebuild and so tests can exercise both states. Whitespace-only
 * counts as unset: `SUPER_ADMIN_STATIC_CODE=" "` is a typo, not a secret.
 */
function configuredCode(): string | null {
  const raw = process.env[VARIABLE];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function staticCodeConfigured(): boolean {
  return configuredCode() !== null;
}

/**
 * The message shown when a privileged operation is attempted and no code has
 * been configured.
 *
 * It names the variable, which is not a leak — the name of a setting is not
 * its value, and an operator who cannot see which variable to set will
 * instead ask somebody to remove the check.
 */
export const STATIC_CODE_NOT_CONFIGURED =
  'This action needs the Super Admin security code, and none is configured for this ' +
  `deployment. Set ${VARIABLE} in the server environment, then try again.`;

export const STATIC_CODE_REJECTED = 'That security code is not correct.';

/**
 * Is this the configured code?
 *
 * Compared as SHA-256 digests rather than as strings, for two reasons:
 *
 *   1. `timingSafeEqual` throws on unequal lengths, so comparing the raw
 *      values would either crash on a wrong-length guess or need a length
 *      check first — and that length check is itself an oracle for how long
 *      the real code is. Digests are always 32 bytes, so every comparison
 *      takes the same path.
 *
 *   2. The comparison is then constant-time in the content, so the number of
 *      leading characters a guess got right cannot be read off the response
 *      time. `a === b` on strings short-circuits at the first difference and
 *      leaks exactly that.
 *
 * Returns false when nothing is configured. Callers must check
 * `staticCodeConfigured()` first and refuse with an explanation, so that
 * "not set up" is never reported to the operator as "wrong code".
 */
export function verifyStaticCode(submitted: string): boolean {
  const expected = configuredCode();
  if (expected === null) return false;
  if (typeof submitted !== 'string' || submitted.length === 0) return false;

  const a = createHash('sha256').update(submitted.trim(), 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();

  return timingSafeEqual(a, b);
}

/**
 * For /api/health and the startup log.
 *
 * Reports only WHETHER a code is configured. Not the value, not its length,
 * not a prefix, not a digest — any of which would narrow a guess.
 */
export function describeStaticCodePolicy(): { configured: boolean; variable: string } {
  return { configured: staticCodeConfigured(), variable: VARIABLE };
}
