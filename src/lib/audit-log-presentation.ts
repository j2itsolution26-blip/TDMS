/**
 * Pure, DB-free helpers for audit log display — split out of
 * audit-log.service.ts specifically so Client Components can import
 * them without pulling in that file's "server-only" tag (which is
 * correct for its Prisma-touching exports, but was incorrectly also
 * blocking these two pure functions from client use).
 */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/** Splits the "Name <email>" convention formatActor() writes, for display. */
export function splitActorLabel(value: string): { name: string; email: string | null } {
  const match = value.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return { name: value, email: null };
  return { name: match[1], email: match[2] };
}

const SENSITIVE_KEY_PATTERN = /password|hash|token|secret|credential|api[_-]?key/i;

/**
 * Recursively strips any key that looks credential-shaped from a details
 * payload before it's ever sent to the client, in case one was ever
 * accidentally logged. Defense in depth: recordAudit() callers shouldn't
 * be passing secrets in the first place, but this is the last line.
 */
export function redactSensitiveDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveDetails);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactSensitiveDetails(val);
    }
    return result;
  }
  return value;
}
