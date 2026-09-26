import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * Login throttling, replacing Laravel's RateLimiter.
 *
 * Laravel kept counters in its cache store, which was the `cache` table.
 * That table is still there, so the same storage is reused rather than
 * adding Redis: one row per key, `expiration` as a unix timestamp, exactly
 * the shape Laravel's database cache driver used. Serverless functions have
 * no shared memory, so an in-process Map would reset on every cold start
 * and throttle nothing.
 *
 * Budget matches the Laravel form: 5 attempts, then a 60 second lockout.
 */

const MAX_ATTEMPTS = 5;
const DECAY_SECONDS = 60;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Namespaced so these rows cannot collide with anything Laravel left. */
function cacheKey(key: string): string {
  return `tdms:login:${key}`;
}

interface Counter {
  attempts: number;
  expiresAt: number;
}

async function readCounter(fullKey: string): Promise<Counter | null> {
  const row = await prisma.legacyCache.findUnique({ where: { key: fullKey } });
  if (!row) return null;

  if (Number(row.expiration) <= nowSeconds()) {
    await prisma.legacyCache.deleteMany({ where: { key: fullKey } });
    return null;
  }

  const attempts = Number.parseInt(row.value, 10);
  return { attempts: Number.isFinite(attempts) ? attempts : 0, expiresAt: Number(row.expiration) };
}

async function read(key: string): Promise<Counter | null> {
  return readCounter(cacheKey(key));
}

export interface ThrottleState {
  limited: boolean;
  retryAfterSeconds: number;
}

export async function checkLoginThrottle(key: string): Promise<ThrottleState> {
  const counter = await read(key);
  if (!counter || counter.attempts < MAX_ATTEMPTS) {
    return { limited: false, retryAfterSeconds: 0 };
  }
  return {
    limited: true,
    retryAfterSeconds: Math.max(1, counter.expiresAt - nowSeconds()),
  };
}

/** Record one failed attempt. */
export async function hitLoginThrottle(key: string): Promise<void> {
  const counter = await read(key);
  const attempts = (counter?.attempts ?? 0) + 1;
  // The window starts at the first failure and is not extended by later
  // ones, matching Laravel's decay behaviour.
  const expiration = counter?.expiresAt ?? nowSeconds() + DECAY_SECONDS;

  await prisma.legacyCache.upsert({
    where: { key: cacheKey(key) },
    create: { key: cacheKey(key), value: String(attempts), expiration: BigInt(expiration) },
    update: { value: String(attempts), expiration: BigInt(expiration) },
  });
}

/** Clear the counter after a successful sign-in. */
export async function clearLoginThrottle(key: string): Promise<void> {
  await prisma.legacyCache.deleteMany({ where: { key: cacheKey(key) } });
}

/**
 * Throttle on identifier + IP together, as Laravel's throttleKey() did, so
 * one noisy network cannot lock a victim out of their own account by
 * guessing at their username from elsewhere.
 */
export function loginThrottleKey(identifier: string, ip: string): string {
  return `${identifier.toLowerCase()}|${ip}`;
}

// --- Generic counters ------------------------------------------------------

/**
 * A fixed-window counter for anything that is not sign-in.
 *
 * Same storage and the same reasoning as the login throttle above — the
 * `cache` table, because serverless functions share no memory and an
 * in-process Map would reset on every cold start and throttle nothing. The
 * budget is per call site rather than global, since "verification attempts
 * from one IP" and "codes sent to one address" want very different numbers.
 *
 * The window starts at the first hit and is not extended by later ones, so a
 * caller that keeps hammering does not keep pushing their own reset away.
 */
export interface RateLimitVerdict {
  limited: boolean;
  retryAfterSeconds: number;
  /** Hits left in this window after the one just recorded. */
  remaining: number;
}

function namespaced(bucket: string, key: string): string {
  return `tdms:rl:${bucket}:${key.toLowerCase()}`;
}

/**
 * Record one hit and say whether the caller is now over budget.
 *
 * Deliberately count-then-decide: the hit is recorded even when it is the one
 * that trips the limit, so a client that ignores the refusal and retries
 * immediately does not get a free attempt each time.
 */
export async function consumeRateLimit(
  bucket: string,
  key: string,
  limit: { max: number; windowSeconds: number },
): Promise<RateLimitVerdict> {
  const fullKey = namespaced(bucket, key);
  const counter = await readCounter(fullKey);

  const attempts = (counter?.attempts ?? 0) + 1;
  const expiration = counter?.expiresAt ?? nowSeconds() + limit.windowSeconds;

  await prisma.legacyCache.upsert({
    where: { key: fullKey },
    create: { key: fullKey, value: String(attempts), expiration: BigInt(expiration) },
    update: { value: String(attempts), expiration: BigInt(expiration) },
  });

  if (attempts > limit.max) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, expiration - nowSeconds()),
      remaining: 0,
    };
  }

  return { limited: false, retryAfterSeconds: 0, remaining: limit.max - attempts };
}

/** Peek without recording a hit. Used to refuse before doing any work. */
export async function checkRateLimit(
  bucket: string,
  key: string,
  limit: { max: number },
): Promise<RateLimitVerdict> {
  const counter = await readCounter(namespaced(bucket, key));
  if (!counter || counter.attempts < limit.max) {
    return { limited: false, retryAfterSeconds: 0, remaining: limit.max - (counter?.attempts ?? 0) };
  }
  return {
    limited: true,
    retryAfterSeconds: Math.max(1, counter.expiresAt - nowSeconds()),
    remaining: 0,
  };
}

/** Drop a counter — after the flow it guards has completed successfully. */
export async function clearRateLimit(bucket: string, key: string): Promise<void> {
  await prisma.legacyCache.deleteMany({ where: { key: namespaced(bucket, key) } });
}
