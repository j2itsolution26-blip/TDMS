/**
 * The password rule, in one place.
 *
 * This module exists so the live checklist the browser draws and the rule the
 * server enforces cannot drift apart. The form imports it to colour the
 * checklist as somebody types; `strongPassword` in
 * src/server/validation/schemas.ts is built from the same list, so a password
 * the checklist calls complete is exactly a password the server accepts.
 *
 * The checklist is a courtesy to the person typing. It is not the rule: the
 * rule runs on the server, on every path that sets a password, and a request
 * that skips the form entirely meets the same requirements.
 */

export const PASSWORD_MIN_LENGTH = 12;

/** Upper bound, so a multi-megabyte string cannot be fed to bcrypt. */
export const PASSWORD_MAX_LENGTH = 200;

export interface PasswordRequirement {
  /** Stable key, used as a React list key and in tests. */
  id: 'length' | 'uppercase' | 'lowercase' | 'number' | 'symbol';
  /** Short form, for the checklist under the field. */
  label: string;
  /** Sentence form, for a server-side validation message. */
  message: string;
  test: (password: string) => boolean;
}

/**
 * Order matters only for display. The character classes are the ones the
 * original Laravel form asserted, kept as they were: length does most of the
 * work, but dropping a class here would weaken every password in the system.
 */
export const PASSWORD_REQUIREMENTS: readonly PasswordRequirement[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    message: `The password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'uppercase',
    label: 'Uppercase letter (A-Z)',
    message: 'The password must contain an uppercase letter.',
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: 'lowercase',
    label: 'Lowercase letter (a-z)',
    message: 'The password must contain a lowercase letter.',
    test: (p) => /[a-z]/.test(p),
  },
  {
    id: 'number',
    label: 'Number (0-9)',
    message: 'The password must contain a number.',
    test: (p) => /[0-9]/.test(p),
  },
  {
    id: 'symbol',
    label: 'Special character (!@#$%^&*)',
    message: 'The password must contain a symbol.',
    /*
     * Any non-alphanumeric character counts, not only the eight shown in the
     * label. Restricting the set would reject `£` or `§` from a password
     * that is otherwise stronger than one built from the listed symbols.
     */
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

/** Which requirements this password satisfies, keyed by id. */
export function evaluatePassword(password: string): Record<PasswordRequirement['id'], boolean> {
  const out = {} as Record<PasswordRequirement['id'], boolean>;
  for (const requirement of PASSWORD_REQUIREMENTS) {
    out[requirement.id] = requirement.test(password);
  }
  return out;
}

/** The messages for every requirement this password fails. */
export function passwordProblems(password: string): string[] {
  const problems = PASSWORD_REQUIREMENTS.filter((r) => !r.test(password)).map((r) => r.message);
  if (password.length > PASSWORD_MAX_LENGTH) problems.push('That password is too long.');
  return problems;
}

export function meetsPasswordPolicy(password: string): boolean {
  return passwordProblems(password).length === 0;
}
