import { Prisma } from '@prisma/client';

/**
 * Page props travel as JSON, but screens were written to receive real Date,
 * Map, Set and BigInt values. Those are therefore tagged here and revived in the browser
 * (client/src/lib/page-data.tsx), so a screen gets back exactly the types
 * its loader produced — BigInt included. Prisma Decimals become numbers, as
 * everywhere else in the API.
 */
export const DATE_TAG = '$date';
export const MAP_TAG = '$map';
export const SET_TAG = '$set';
export const BIGINT_TAG = '$bigint';

export function encodePageData(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return { [DATE_TAG]: value.toISOString() };
  if (typeof value === 'bigint') return { [BIGINT_TAG]: value.toString() };
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (Array.isArray(value)) return value.map(encodePageData);
  if (value instanceof Map) return { [MAP_TAG]: [...value].map(([k, v]) => [encodePageData(k), encodePageData(v)]) };
  if (value instanceof Set) return { [SET_TAG]: [...value].map(encodePageData) };
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && typeof v !== 'function')
        .map(([k, v]) => [k, encodePageData(v)]),
    );
  }
  return value;
}
