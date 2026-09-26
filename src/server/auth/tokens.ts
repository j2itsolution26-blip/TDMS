import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';

/**
 * Email verification and password reset tokens.
 *
 * Both follow the same rules, which is why they share this module:
 *
 *   * 32 bytes from a CSPRNG, hex encoded — not guessable, and not derived
 *     from anything about the user;
 *   * only the SHA-256 is stored, so a database dump yields no usable link.
 *     SHA-256 rather than bcrypt is correct because the input already has
 *     256 bits of entropy: there is nothing to brute force, and a slow hash
 *     would only slow down legitimate verification;
 *   * single use — consumed atomically, so a link cannot be replayed even if
 *     two requests arrive at once;
 *   * expiring;
 *   * issuing a new one invalidates the outstanding ones for that user, so a
 *     forwarded old email stops working.
 *
 * The plaintext token is returned once, to be put in an email, and is never
 * logged or persisted.
 */

const TOKEN_BYTES = 32;

/** A verification link should outlive a lunch break but not a weekend. */
const VERIFICATION_TTL_HOURS = Number(process.env.EMAIL_VERIFICATION_TTL_HOURS ?? 24);

/** Reset windows are deliberately shorter than verification windows. */
const RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 60);

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// --- Email verification ----------------------------------------------------

export interface IssuedToken {
  /** Plaintext. Goes in the email and nowhere else. */
  token: string;
  expiresAt: Date;
}

/**
 * Issue a verification token for a user's current address.
 *
 * The address is recorded alongside the token: if the account's email is
 * changed before the link is clicked, the token no longer matches and is
 * refused. Without that, an old link could confirm an address the user has
 * since moved away from.
 */
export async function issueEmailVerificationToken(
  userId: bigint,
  email: string,
): Promise<IssuedToken> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 3_600_000);

  await prisma.$transaction([
    // Supersede anything outstanding for this user.
    prisma.emailVerificationToken.deleteMany({ where: { userId, consumedAt: null } }),
    prisma.emailVerificationToken.create({
      data: { userId, email, tokenHash: hashToken(token), expiresAt },
    }),
  ]);

  return { token, expiresAt };
}

export type VerificationOutcome =
  | { ok: true; userId: bigint; email: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'email_changed' };

/**
 * Consume a verification token.
 *
 * The update is conditional on `consumedAt: null` inside a transaction, so
 * two simultaneous clicks cannot both succeed — the second finds zero rows
 * affected and is told the token is used.
 */
export async function consumeEmailVerificationToken(
  token: string,
): Promise<VerificationOutcome> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return { ok: false, reason: 'invalid' };

  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      email: true,
      expiresAt: true,
      consumedAt: true,
      user: { select: { email: true } },
    },
  });

  if (!record) return { ok: false, reason: 'invalid' };
  if (record.consumedAt) return { ok: false, reason: 'used' };
  if (record.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  if (record.user.email !== record.email) return { ok: false, reason: 'email_changed' };

  const { count } = await prisma.emailVerificationToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count === 0) return { ok: false, reason: 'used' };

  return { ok: true, userId: record.userId, email: record.email };
}

// --- Password reset --------------------------------------------------------

export async function issuePasswordResetToken(userId: bigint): Promise<IssuedToken> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);

  await prisma.$transaction([
    prisma.passwordResetRequest.deleteMany({ where: { userId, consumedAt: null } }),
    prisma.passwordResetRequest.create({
      data: { userId, tokenHash: hashToken(token), expiresAt },
    }),
  ]);

  return { token, expiresAt };
}

export type ResetOutcome =
  | { ok: true; userId: bigint }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

export async function consumePasswordResetToken(token: string): Promise<ResetOutcome> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return { ok: false, reason: 'invalid' };

  const record = await prisma.passwordResetRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, consumedAt: true },
  });

  if (!record) return { ok: false, reason: 'invalid' };
  if (record.consumedAt) return { ok: false, reason: 'used' };
  if (record.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

  const { count } = await prisma.passwordResetRequest.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count === 0) return { ok: false, reason: 'used' };

  return { ok: true, userId: record.userId };
}

/** Housekeeping, for the scheduled job described in docs/deployment.md. */
export async function pruneExpiredTokens(): Promise<number> {
  const now = new Date();
  const [a, b] = await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.passwordResetRequest.deleteMany({ where: { expiresAt: { lte: now } } }),
  ]);
  return a.count + b.count;
}
