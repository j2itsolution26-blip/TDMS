# Authentication

## Summary

Sign-in accepts **either a username or an email address**, verifies a
bcrypt hash, checks the account is active, then creates a server-side
session and sets an HTTP-only cookie. Every existing password keeps
working: the hashes were written by PHP and are read unchanged.

There is no hard-coded credential, no demo shortcut and no bypass. Demo
accounts authenticate through the identical code path as anyone else.

## The bug this migration fixed

The login field has always been labelled "Username or Email", but under
Laravel only an email could ever work:

- the input was `type="email"`, so the browser blocked a bare username
  before the form could submit;
- the Livewire form validated the identifier with the `email` rule;
- `Auth::attempt(['email' => …])` queried the `email` column alone;
- and there was no `username` column in the first place.

`users.username` (nullable, unique) was added, and the identifier is now
resolved to a column before lookup.

## Password hashing

Laravel wrote every hash with `password_hash(PASSWORD_BCRYPT)` at cost 12,
which produces the `$2y$` prefix. `bcryptjs` implements the same corrected
Blowfish variant and accepts `$2y$` directly, so:

- no account needed a password reset;
- no rehash-on-login shim was required;
- `BCRYPT_ROUNDS` stays at 12 so new hashes match the old cost.

`needsRehash()` upgrades a hash opportunistically if the cost is ever
raised.

## Identifier resolution

```ts
const trimmed = raw.trim();
column = trimmed.includes('@') ? 'email' : 'username';
value  = trimmed.toLowerCase();
```

Both sides of the comparison are lower-cased (`mode: 'insensitive'`), so
emails match case-insensitively and so do usernames. Whitespace is trimmed
because it is nearly always a paste artefact.

## Account enumeration

A bad identifier and a bad password produce the **same** response:

```
401  { "success": false, "message": "Invalid username/email or password." }
```

Two further details matter:

1. A bcrypt comparison runs even when no user matched, against a throwaway
   hash of the same cost. Skipping it would let an attacker tell "no such
   account" from "wrong password" by timing alone.
2. The "Your account is inactive" message is only returned **after** the
   password is verified. Returning it earlier would turn it into an oracle
   for which accounts exist.

## Sessions

A 32-byte random token goes to the browser in an HTTP-only cookie. Only its
SHA-256 is stored in `auth_sessions`, so a database dump cannot be replayed
as a live session. SHA-256 rather than bcrypt is correct here: the input is
already 256 bits of entropy, so there is nothing to brute force.

| Property   | Value                                                |
| ---------- | ---------------------------------------------------- |
| Cookie     | `tdms_session`                                       |
| `httpOnly` | always                                               |
| `secure`   | `NODE_ENV === 'production'`                          |
| `sameSite` | `lax`                                                |
| `path`     | `/`                                                  |
| Lifetime   | `SESSION_LIFETIME_MINUTES` (default 120)             |
| Remember   | 5 years, matching Laravel                            |

`secure` is derived rather than hard-coded on purpose. Forcing it on would
silently break sign-in over plain HTTP on localhost: the browser would
refuse to store the cookie and the user would bounce straight back to
`/login` with correct credentials — the exact symptom that is so confusing
to diagnose. On Vercel every request is HTTPS, so it is on in production.

Sessions are destroyed on sign-out, when an account is deactivated, and
when an administrator resets a password.

Laravel's old `sessions` table is left in place but unused: its `payload`
is a PHP-serialised blob Node cannot read.

## Where authorization is enforced

`src/middleware.ts` runs on the Edge runtime, where Prisma cannot reach
Postgres. It can therefore only see whether a session cookie is *present* —
not whether it is valid, whose it is, or what they may do. It exists to
save a round trip for obviously-anonymous traffic.

**The authoritative checks are in the data layer**, where they cannot be
skipped:

- `requireUser()` / `requireApiUser()` resolve and validate the session,
  reload the account, and sign out a user who has been deactivated.
- Every page calls `authorizePage(policy(user))`; every route handler calls
  `authorize(policy(user))`.

Keeping one source of truth is what prevents the classic redirect loop
where middleware trusts a session the application does not.

## The /login <-> /dashboard handoff

Two rules, and the split between them is the whole point:

- **Middleware** may redirect traffic that looks anonymous *away from*
  protected routes. Being wrong costs one extra hop.
- **Only the data layer** may redirect traffic that looks authenticated
  *away from* `/login`. Being wrong here costs an infinite loop.

Middleware sees a cookie, not a session. If it redirected every
cookie-holder from `/login` to `/dashboard`, then a stale cookie — expired,
revoked, or belonging to a deactivated account — would bounce forever:
middleware sends you to `/dashboard`, the app resolves the session properly,
finds it worthless, and sends you back to `/login`. So `/login` itself calls
`getCurrentUser()` and redirects only when the session genuinely resolves.

A stale cookie is therefore harmless. It grants nothing, it is ignored, and
the next successful sign-in overwrites it.

## getCurrentUser() is read-only

`getCurrentUser()` runs during Server Component render, and Next.js does not
permit writing cookies there — "Setting cookies is not supported during
Server Component rendering", and `.delete()` is restricted to a Server
Function or Route Handler.

So it never clears the cookie, however worthless the session turns out to
be. An earlier version did, which meant a stale session or a mid-session
deactivation threw during render and surfaced as a 500 on every protected
page instead of a redirect.

Revocation does not depend on clearing the cookie: sign-out, deactivation
and administrative password resets all delete the session **row**, and a
token that resolves to no row grants nothing.

## Diagnosing a broken environment

`GET /api/health` is unauthenticated, because it is needed exactly when
nobody can sign in. It reports whether a trivial query succeeds, the Prisma
error **code** if not (`P1001` unreachable, `P1000` credentials rejected,
`P2021` missing table), and for each required variable whether it is **set**
— a boolean, never a value.

```bash
curl -s https://<deployment>/api/health | jq
```

| Response                                          | Means                                  |
| ------------------------------------------------- | -------------------------------------- |
| `status: ok`                                      | database reachable, config present     |
| `env.DATABASE_URL: false`                         | the variable is not set for this env   |
| `DATABASE_URL: true` + `errorCode: P1001`         | set, but the host is unreachable       |
| `DATABASE_URL: true` + `errorCode: P1000`         | set, but credentials were rejected     |

Related: `/login` no longer fails as a whole when the database is down. The
only query it makes is the cosmetic "does a Super Admin exist yet?" probe;
that is now logged and degraded to a plain notice, so the form still renders
and a sign-in attempt still reports its own error, instead of the page
collapsing into an opaque digest.

## Rate limiting

Five failed attempts per `identifier|ip`, then a 60-second lockout —
the same budget Laravel used. Counters live in the existing `cache` table
rather than in memory, because serverless functions share no memory and an
in-process `Map` would reset on every cold start and throttle nothing.

The Super Admin setup flow uses the same storage through
`consumeRateLimit()`, with its own budgets: 6 codes per email address and 10
per IP in an hour, and 20 verification attempts per IP in 15 minutes. Those
sit on top of the per-registration caps described below, and are what stop the
flow being restarted to get around them.

## First-time setup

A fresh installation has roles and permissions but no users. The only way to
obtain the first Super Admin through the web is `/create-super-admin`, which
is reachable only while no Super Admin exists — the page redirects and every
endpoint behind it refuses independently, re-checked inside the transaction
that finally creates the account so it cannot be raced.

**No account exists before the institutional address has been verified.** The
flow is three steps and the order is the point:

1. `POST /api/auth/super-admin/start` — validates the details and writes a row
   to `pending_admin_registrations`, with the password already bcrypt-hashed.
   No `users` row, no role, no session. A six-digit code is generated with
   `randomInt` from the CSPRNG, hashed, and emailed. If the mail cannot be
   sent, the pending row is deleted again: an unsendable code must not leave a
   half-finished registration holding the address.
2. `POST /api/auth/super-admin/verify` — checks the code. Success sets
   `verified_at` and empties `verification_code_hash`, so the code is strictly
   single use. It creates nothing and issues no session.
3. `POST /api/auth/super-admin` — creates the account, assigns the role, marks
   the email verified and issues the first session, in that order. It takes no
   request body: everything comes from the pending row, so nothing about the
   account can be changed between verification and creation. It refuses unless
   `verified_at` is set.

Why the code is hashed with bcrypt rather than SHA-256, when link tokens use
SHA-256: a link token carries 256 bits of entropy and there is nothing to
brute force, but a six-digit code has under 20 bits, and a million SHA-256
candidates can be swept in well under a second from a database dump. bcrypt's
cost and per-row salt make that sweep cost weeks, for one row.

Guessing, not cracking, is the real threat at that entropy, so the attempt cap
is what actually protects the code: five wrong guesses and the code is burnt
outright — its hash is emptied, and even the right digits stop working until a
new code is requested. Resends are capped at three per registration with a
60-second cooldown, and the code expires after 10 minutes.

The browser is tied to its pending registration by an HttpOnly cookie holding
a 32-byte random handle, stored only as its SHA-256. That is what lets a
refresh mid-verification resume instead of stranding the operator, and it means
verification attempts cannot be aimed at a pending registration the browser
does not hold. The code itself never reaches the browser, an API response, a
log line or an error message.

Claiming the pending row is a conditional delete **inside** the creating
transaction, so two concurrent requests cannot both create an account: the
second deletes nothing, fails its count check and rolls back.

`npm run admin:create` remains for the case where no mail provider is
configured yet — it requires shell access and the database credentials, which
is a strictly higher bar than any web flow. See
[accounts.md](accounts.md).

## Roles and permissions

Unchanged. The seven roles and 24 permissions are read from the existing
spatie tables, keyed on `model_type = 'App\Models\User'` — the literal PHP
class name, so existing assignment rows stay valid.

`AppServiceProvider` registered `Gate::before(… super_admin ? true : null)`,
granting a Super Admin every ability. That blanket grant is reproduced in
`policies.ts`. It has exactly one deliberate exception, the same one
Laravel had to re-assert by hand: a Super Admin still cannot deactivate
their own account.
