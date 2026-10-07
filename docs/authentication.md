# Authentication

## Summary

Sign-in accepts **either a username or an email address**, verifies the
password hash (Argon2id, or a legacy bcrypt hash from Laravel), checks the
account is active, then creates a server-side session and sets an HTTP-only
cookie. Every existing password keeps working without a reset.

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

New passwords are hashed with **Argon2id** (`@node-rs/argon2`) at the OWASP
baseline: 19 MiB memory, 2 iterations, 1 lane. All of it lives in
`src/server/auth/password.ts`.

Laravel wrote every existing hash with `password_hash(PASSWORD_BCRYPT)` at
cost 12 (`$2y$`). `verifyPassword()` recognises the prefix and checks those
with `bcryptjs`, so:

- no account needs a password reset;
- `needsRehash()` reports every bcrypt hash as stale, and a successful sign-in
  rewrites it as Argon2id — the only moment the plaintext is available;
- once no `$2` hash remains in `users.password`, bcrypt can be removed from
  the password path.

`BCRYPT_ROUNDS` no longer affects passwords; it is the cost for the
short-lived one-time codes (Admin access codes, email verification codes).

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

1. A password comparison runs even when no user matched, against a throwaway
   Argon2id hash at the production parameters. Skipping it would let an attacker tell "no such
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

First-run setup uses the same storage through `consumeRateLimit()`: 10
attempts per IP in 15 minutes, counted before the setup key is checked, so
wrong guesses spend the budget.

## First-time setup

A fresh installation has roles and permissions but no users, and is
**uninitialized**: no `system_installation` row and no `users` rows. In that
state `/login` says "TDMS has not been initialized yet." and links to `/setup`.

`/setup` creates the first Super Admin from four fields — name, email, password
and confirmation — plus the **setup key**. The key is `SETUP_KEY` from the
server environment (at least 16 characters). Being the first visitor to
`/setup` proves nothing on a public deployment; knowing a value that exists
only in the server environment proves you operate the server. Without it
configured, `/setup` stays locked and says which variable to set.

`POST /api/setup` (`src/server/services/setup-service.ts`) refuses, in order:
once the system is initialized (409); when no usable `SETUP_KEY` is configured
(503); after 10 attempts per IP in 15 minutes (429); a wrong key (403,
compared in constant time, audited as `INITIAL_SETUP_KEY_REJECTED`). Then it
hashes the password with Argon2id and runs one transaction that re-counts
users, inserts the `system_installation` row and creates the user and the
`super_admin` assignment. The row's primary key is pinned to 1 by a CHECK
constraint, so of two concurrent setups one commits and the other fails on the
key — creating nothing — and gets "TDMS has already been initialized."

The password chosen there is the account's real password: `must_change_password`
is false and no temporary credential exists. No session is issued; the browser
goes to `/login?setup=complete` and the new Super Admin signs in normally.
Once initialized, `/setup` shows "TDMS has already been initialized." and
redirects to `/login`. Deleting users alone does not reopen it — only
`npm run db:fresh` removes the installation row.

`npm run admin:create` is the same step from a shell, without the key: shell
plus database access is a higher bar than the key. It follows the same rules
and claims the same row.

`/create-super-admin` and `/api/auth/super-admin/*` (the earlier
email-verified bootstrap) are retired; the page redirects to `/setup`.

### Resetting to a fresh installation

`npm run db:fresh` empties every table except configuration and the academic
catalogue (roles, permissions and grants, credential requirements, programs,
curricula, subjects, school years). It reads the foreign keys from PostgreSQL
to delete children first, refuses if a kept table references an emptied one,
and runs in one transaction. Without `--apply` it is a dry run; with it, it
also requires `CONFIRM_DB_FRESH=<database name>` and a non-production
`NODE_ENV`, and writes the deleted rows to `backups/` first.

## Roles and permissions

Unchanged. The seven roles and 24 permissions are read from the existing
spatie tables, keyed on `model_type = 'App\Models\User'` — the literal PHP
class name, so existing assignment rows stay valid.

`AppServiceProvider` registered `Gate::before(… super_admin ? true : null)`,
granting a Super Admin every ability. That blanket grant is reproduced in
`policies.ts` for **viewing** only. For **acting**, the TDMS structure applies:
the Super Admin controls the system and "shouldn't be processing daily
enrollment, classes, attendance, or grades". So `can()` gives a Super Admin an
explicit allow-list — `system.configure`, `audit-logs.view`, `reports.view.full`,
`dashboard.view.institutional` — and nothing operational (`programs.manage`,
`students.manage`, `students.enroll`, `applications.review`,
`credentials.verify`, `grades.*`, …), whatever their role rows say. View policies
use `inRoles()`, which still admits them, so they keep oversight of every screen.

The Director may view Students (monitoring) without managing them.

Two further rules:

- **Staff accounts.** The Super Admin maintains the system and creates Admins;
  the Admin staffs the institution. `userPolicy` is built on `managesStaff()`,
  which reads `accounts.manage` straight off the principal and excludes the
  Super Admin explicitly — so the blanket grant cannot let them in, and neither
  can a stray grant of the permission to their role. Only `admin` holds
  `accounts.manage` (migration `20260927010000_staff_management_admin_only`
  removed it from `super_admin` and `director`).
- **Self-targeting.** Nobody, a Super Admin included, can suspend or deactivate
  their own account.

```
SUPER ADMIN   system maintenance — creates and controls Admins
     │
   ADMIN      creates and manages staff accounts
     ├── Director
     ├── Coordinator
     ├── Secretary
     └── Teacher
```
