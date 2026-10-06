import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS,
  meetsPasswordPolicy,
} from './password-policy';

/**
 * A temporary password for an Admin account a Super Admin is creating.
 *
 * Generated rather than typed, because a password an administrator invents
 * for somebody else is reliably the worst one in the system: it has to be
 * short enough to read down a phone line, so it ends up being
 * `Welcome2026!` on every account.
 *
 * ONE IMPLEMENTATION, TWO RUNTIMES
 *
 * The "Generate password" button in the browser and the server-side reissue
 * path both call this. It therefore uses `crypto.getRandomValues`, which is
 * the Web Crypto API and is present as a global in both Node and the browser
 * — rather than `node:crypto`, which would have forced a second copy of the
 * alphabet and the assembly rules for the client. Two copies of a password
 * generator is two places for the policy to drift out of step.
 *
 * Three properties, all of which matter:
 *
 *   1. CRYPTOGRAPHICALLY RANDOM. Never Math.random: this value is a live
 *      credential from the moment it exists, and Math.random's output is
 *      recoverable from a handful of prior draws.
 *
 *   2. UNBIASED. `randomBelow` rejects the tail of the 32-bit range that
 *      would skew a modulo, so every character is equally likely. The
 *      `bytes[i] % alphabet.length` idiom is not uniform and favours the
 *      first characters of the alphabet.
 *
 *   3. IT SATISFIES THE APPLICATION'S OWN PASSWORD POLICY. A generated
 *      password the change-password form would reject is a support call, and
 *      worse, an invitation to weaken the policy so the generator works. One
 *      character is drawn from each required class first, the rest from the
 *      full alphabet, and the result is shuffled so the classes do not sit in
 *      a predictable position.
 *
 * It is shown once to the Super Admin, stored only as an Argon2id hash, and
 * never written to a log, an audit record or an email by this application.
 * The account is marked `mustChangePassword`, so it stops being a credential
 * the first time it is used.
 */

/**
 * Ambiguous characters are left out: O/0 and I/l/1. This password is read
 * aloud or copied by hand at least once, and `l` versus `1` in that setting
 * is not a security property, it is a wasted phone call. What remains is
 * still 68 characters, which over the length below carries far more entropy
 * than the policy asks for.
 */
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*?-+=';

const ALPHABET = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;

/**
 * Comfortably above PASSWORD_MIN_LENGTH rather than exactly at it, so raising
 * the policy's minimum cannot silently start producing passwords the policy
 * rejects.
 */
const LENGTH = Math.max(16, PASSWORD_MIN_LENGTH + 4);

const UINT32_RANGE = 0x1_0000_0000;

/**
 * A uniform integer in [0, max), from the platform CSPRNG.
 *
 * Rejection sampling: draws above the largest multiple of `max` are thrown
 * away, which is what removes the modulo bias. The loop terminates with
 * probability 1 and in practice almost always on the first draw — for any
 * `max` under 100 the rejected slice of the 32-bit range is under a
 * billionth.
 */
function randomBelow(max: number): number {
  if (!Number.isInteger(max) || max <= 0) {
    throw new RangeError('randomBelow needs a positive integer bound.');
  }

  const source = globalThis.crypto;
  if (!source?.getRandomValues) {
    /*
     * Deliberately a hard failure rather than a Math.random fallback. A
     * silent downgrade here would produce guessable passwords that look
     * exactly like good ones.
     */
    throw new Error('No cryptographic random source is available.');
  }

  const limit = Math.floor(UINT32_RANGE / max) * max;
  const buffer = new Uint32Array(1);

  for (;;) {
    source.getRandomValues(buffer);
    const drawn = buffer[0]!;
    if (drawn < limit) return drawn % max;
  }
}

function pick(source: string): string {
  return source[randomBelow(source.length)]!;
}

/** Fisher-Yates, with every swap index drawn from the CSPRNG. */
function shuffle(characters: string[]): string[] {
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = randomBelow(i + 1);
    [characters[i], characters[j]] = [characters[j]!, characters[i]!];
  }
  return characters;
}

export function generateTemporaryPassword(): string {
  // One from each required class, so the policy is met by construction and
  // not by chance.
  const required = [pick(UPPERCASE), pick(LOWERCASE), pick(DIGITS), pick(SYMBOLS)];

  const rest = Array.from({ length: LENGTH - required.length }, () => pick(ALPHABET));

  const password = shuffle([...required, ...rest]).join('');

  /*
   * Checked against the real policy object rather than against a restatement
   * of it. If somebody adds a requirement to PASSWORD_REQUIREMENTS that this
   * generator does not cover, this throws in development and in tests instead
   * of shipping a generator whose output the application refuses.
   */
  if (!meetsPasswordPolicy(password)) {
    throw new Error(
      'generateTemporaryPassword produced a password the policy rejects. ' +
        `Requirements are: ${PASSWORD_REQUIREMENTS.map((r) => r.id).join(', ')}.`,
    );
  }

  return password;
}

export const TEMPORARY_PASSWORD_LENGTH = LENGTH;
