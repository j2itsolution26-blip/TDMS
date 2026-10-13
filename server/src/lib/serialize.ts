import { Prisma } from '@prisma/client';

/**
 * Prisma hands back BigInt ids and Decimal units, neither of which survives
 * JSON.stringify or the React server/client boundary. Everything crossing
 * either boundary goes through here first.
 */
export function toPlain<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toPlain(v)]),
    );
  }
  return value;
}

/** Laravel rendered decimal:1 casts as "3.0"; keep that formatting. */
export function formatUnits(units: Prisma.Decimal | number | string): string {
  const n = typeof units === 'number' ? units : Number(units.toString());
  return n.toFixed(1);
}
