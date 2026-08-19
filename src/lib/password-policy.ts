/**
 * Single source of truth for password strength — used both for the
 * live client-side checklist and the server-side check in setup/staff
 * actions, so the two can never drift apart. No "server-only" import
 * deliberately: the client checklist component needs this too.
 */
export type PasswordRule = {
  id: string;
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  {
    id: "case",
    label: "Uppercase and lowercase letters",
    test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p),
  },
  { id: "number", label: "Number", test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "Special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
