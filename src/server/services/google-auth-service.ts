import 'server-only';
import { prisma } from '@/lib/prisma';
import { isInstitutionalEmail, normalizeEmail, INSTITUTIONAL_DOMAIN } from '@/lib/institutional-email';
import { createSession } from '@/server/auth/session';
import { recordAudit } from './audit-log';
import type { GoogleIdentity } from '@/server/auth/google/oauth';

/**
 * What to do once Google has proved who somebody is.
 *
 * The distinction this file exists to keep straight: **Google
 * authentication is not TDMS authorization.** Google telling us that this is
 * really jane.cruz@asiancollege.edu.ph says nothing about whether her TDMS
 * account is allowed in. Those are separate decisions, made in that order.
 */

/** Every way this can end. The route maps these onto messages and redirects. */
export type GoogleSignInOutcome =
  | { kind: 'signed_in'; userId: bigint; redirectTo: string }
  | { kind: 'email_unverified' }
  | { kind: 'wrong_domain' }
  | { kind: 'pending'; created: boolean }
  | { kind: 'inactive' }
  | { kind: 'suspended' };

export interface SignInContext {
  ip: string;
  userAgent: string | null;
}

/**
 * Sign in — or refuse to — with a verified Google identity.
 *
 * Query budget, per §16: one lookup (indexed, by `google_id` then `email`),
 * one write, one session insert. No table scan, and no second round trip to
 * Google: everything needed is already in the verified ID token.
 */
export async function signInWithGoogle(
  identity: GoogleIdentity,
  context: SignInContext,
): Promise<GoogleSignInOutcome> {
  /*
   * Google's own verification of the address comes first. An unverified
   * Google email proves nothing — on a consumer account it can be anything
   * the holder typed.
   */
  if (!identity.emailVerified) return { kind: 'email_unverified' };

  const email = normalizeEmail(identity.email);

  /*
   * The domain check, server-side, on the address Google vouched for — not
   * on anything a client sent. `hd` is checked too when present: a Workspace
   * account carries its hosted domain, and a mismatch between `hd` and the
   * address is a reason to stop rather than to guess.
   */
  if (!isInstitutionalEmail(email)) return { kind: 'wrong_domain' };
  if (identity.hostedDomain && identity.hostedDomain.toLowerCase() !== INSTITUTIONAL_DOMAIN) {
    return { kind: 'wrong_domain' };
  }

  /*
   * Look up by `sub` first, because it is stable: somebody whose address the
   * college changed is still the same person and must not become a second
   * account. Fall back to the address, which is how an invited account — or
   * one that predates Google sign-in — gets linked on first use.
   */
  const existing = await prisma.user.findFirst({
    where: { OR: [{ googleId: identity.sub }, { email }] },
    select: {
      id: true,
      email: true,
      googleId: true,
      status: true,
      emailVerifiedAt: true,
      name: true,
    },
  });

  const profile = {
    firstName: identity.givenName,
    lastName: identity.familyName,
    avatarUrl: identity.picture,
  };

  if (!existing) {
    /*
     * First sign-in by somebody nobody invited.
     *
     * The account is created PENDING and with NO ROLE AT ALL. Not student,
     * not anything: a role is an authorization decision and holding a
     * college mailbox is not grounds for one. An administrator assigns the
     * role and activates the account. There is no path here by which a
     * self-registering visitor obtains privileges.
     */
    const created = await prisma.user.create({
      data: {
        name: identity.name ?? email,
        ...profile,
        email,
        googleId: identity.sub,
        // Google has verified it; that is what emailVerifiedAt records.
        emailVerifiedAt: new Date(),
        status: 'PENDING',
        isActive: false,
        /*
         * No password, and none that can ever be guessed: a random value
         * hashed and discarded on this line. Sign-in for this account is
         * through Google only, unless an administrator sends a reset link.
         */
        password: await placeholderPassword(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      select: { id: true },
    });

    await recordAudit({
      action: 'ACCOUNT_SELF_REGISTERED_VIA_GOOGLE',
      actor: 'GOOGLE_SIGN_IN',
      target: email,
      details: { status: 'PENDING', role: null, google_sub_present: true },
      context: { ip: context.ip, userAgent: context.userAgent },
    });

    return { kind: 'pending', created: true };
  }

  /*
   * Link the Google identity on first use. This is how an invited account
   * becomes usable with no mail provider at all: the invitation established
   * who should have access, and Google establishes that this is them.
   */
  const needsLink = existing.googleId !== identity.sub;

  /*
   * Promotion to ACTIVE happens only for an account that was waiting on
   * exactly this — a PENDING account somebody deliberately created. It never
   * happens for INACTIVE or SUSPENDED, because those are decisions an
   * administrator made and signing in with Google must not undo them.
   *
   * A self-registered PENDING account is not promoted either: it has no role
   * and nobody has approved it. It is told apart by having no role assigned.
   */
  let promote = false;
  if (existing.status === 'PENDING') {
    const roleCount = await prisma.modelHasRole.count({
      where: { modelId: existing.id, modelType: 'App\\Models\\User' },
    });
    promote = roleCount > 0;
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      ...(needsLink ? { googleId: identity.sub } : {}),
      ...profile,
      // Google vouches for the address on every sign-in.
      emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      ...(promote ? { status: 'ACTIVE', isActive: true } : {}),
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const status = promote ? 'ACTIVE' : existing.status;

  if (status === 'SUSPENDED') return { kind: 'suspended' };
  if (status === 'INACTIVE') return { kind: 'inactive' };
  if (status !== 'ACTIVE') return { kind: 'pending', created: false };

  await createSession(existing.id, {
    remember: false,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  if (needsLink || promote) {
    await recordAudit({
      action: promote ? 'ACCOUNT_ACTIVATED_VIA_GOOGLE' : 'ACCOUNT_GOOGLE_LINKED',
      actor: 'GOOGLE_SIGN_IN',
      target: `${existing.name} <${email}>`,
      details: { previous_status: existing.status, linked: needsLink, promoted: promote },
      context: { ip: context.ip, userAgent: context.userAgent },
    });
  }

  /*
   * Every role lands on /dashboard, which renders per-role content behind
   * the same policies. There is no role-to-URL map to get out of step with
   * the roles table.
   */
  return { kind: 'signed_in', userId: existing.id, redirectTo: '/dashboard' };
}

/** An unguessable value, hashed and immediately forgotten. */
async function placeholderPassword(): Promise<string> {
  const { hashPassword } = await import('@/server/auth/password');
  const { randomUUID } = await import('node:crypto');
  return hashPassword(`${randomUUID()}${randomUUID()}`);
}
