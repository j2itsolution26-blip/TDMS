import { prisma } from '@/server/lib/prisma';

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

/**
 * Add one to a counter in a single statement and return the new count.
 *
 * Atomic on purpose. Reading the count and writing count + 1 back as two
 * queries let a burst of parallel requests all read the same number, so 20
 * simultaneous guesses each saw "0 attempts so far". Postgres serialises
 * INSERT … ON CONFLICT DO UPDATE on one row, so every hit lands. An expired
 * window restarts at 1; a live one keeps its original expiry.
 */
async function increment(fullKey: string, windowSeconds: number): Promise<Counter> {
  const now = nowSeconds();
  const rows = await prisma.$queryRaw<{ value: string; expiration: bigint }[]>`
    INSERT INTO "cache" ("key", "value", "expiration")
    VALUES (${fullKey}, '1', ${BigInt(now + windowSeconds)})
    ON CONFLICT ("key") DO UPDATE SET
      "value" = CASE
        WHEN "cache"."expiration" <= ${BigInt(now)} OR "cache"."value" !~ '^[0-9]+$' THEN '1'
        ELSE ("cache"."value"::bigint + 1)::text
      END,
      "expiration" = CASE
        WHEN "cache"."expiration" <= ${BigInt(now)} THEN EXCLUDED."expiration"
        ELSE "cache"."expiration"
      END
    RETURNING "value", "expiration"`;
  const row = rows[0]!;
  return { attempts: Number.parseInt(row.value, 10), expiresAt: Number(row.expiration) };
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

/**
 * Count this attempt BEFORE checking anything, and say whether it is over
 * budget. Every attempt counts; a successful one clears the counter
 * (clearLoginThrottle). Counting first is what stops parallel guesses: with
 * check-then-record, a burst all passed the check before any was recorded.
 * Same budget as before — five attempts, the sixth is refused.
 */
export async function consumeLoginAttempt(key: string): Promise<ThrottleState> {
  // The window starts at the first attempt and is not extended by later
  // ones, matching Laravel's decay behaviour.
  const counter = await increment(cacheKey(key), DECAY_SECONDS);
  if (counter.attempts <= MAX_ATTEMPTS) return { limited: false, retryAfterSeconds: 0 };
  return { limited: true, retryAfterSeconds: Math.max(1, counter.expiresAt - nowSeconds()) };
}

/** Record one failed attempt (atomically). */
export async function hitLoginThrottle(key: string): Promise<void> {
  await increment(cacheKey(key), DECAY_SECONDS);
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
  const { attempts, expiresAt: expiration } = await increment(namespaced(bucket, key), limit.windowSeconds);

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
