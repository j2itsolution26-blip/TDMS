# Administrator accounts and access codes

Written for: whoever operates and maintains TDMS — the Super Admin who will use
these screens, and the next developer to touch the code behind them.

```
              SUPER ADMIN
                   │
          SUPER ADMIN DASHBOARD
          ┌────────┴────────┐
    Admin Accounts     Admin Access Codes
    create an Admin    generate a code for them
          └────────┬────────┘
               ADMIN LOGIN
   email + password → access code → new password → Admin Dashboard
```

An Admin signs in with **three** things: their email, their password, and a
one-time access code issued from the Super Admin Dashboard. The code is not the
password and does not replace it. There is no approval queue, no pending
approval state, and no invitation: a Super Admin creates the account outright,
and it is ACTIVE from the start.

---

## The two secrets, which are not the same thing

|                | Super Admin security code | Admin access code |
| -------------- | ------------------------- | ----------------- |
| Purpose        | Root-level Super Admin security | Admin login verification |
| Where it lives | `SUPER_ADMIN_STATIC_CODE`, server environment only | `admin_access_codes`, as a bcrypt hash |
| Who has it     | The system owner | One Admin, for one sign-in |
| Lifetime       | Until the owner changes it | 10 minutes by default, one use |
| Asked for when | Never, by any routine action | Every Admin sign-in |
| Code           | `src/server/auth/super-admin-code.ts` | `src/server/auth/admin-access-code.ts` |

They are never treated as the same code. The static code is never accepted at
an Admin sign-in, and an access code is never accepted in its place.

### `SUPER_ADMIN_STATIC_CODE`

A root-level secret held by the system owner. Configure it in the server
environment; the dashboard shows only whether it is configured.

It is **not** asked for when creating an Admin, generating or revoking an access
code, or resetting a password. The signed-in Super Admin Dashboard is the trust
boundary for those actions. The code stays available on the server, never
exposed, for root-level operations that need it.

It is never hard-coded, never `NEXT_PUBLIC_`, never stored in the database,
never returned by an API, never rendered, never logged, never put in an audit
record. `/api/health` and the dashboard report `configured: true/false` and
nothing else.

**On Vercel:** Settings → Environment Variables → Add `SUPER_ADMIN_STATIC_CODE`
→ tick the environments → Save → Deployments → ⋯ → **Redeploy**. Generate a value
with `openssl rand -base64 24` and keep it in a password manager.

---

## Creating an Admin — Admin Accounts

**Super Admin Dashboard → Admin Accounts → Create Admin.**

Full name, email address and a temporary password (**Generate password** makes a
strong one). No security code.

- The account is created **ACTIVE** with the `admin` role.
- `must_change_password` is set. It is a fact about the credential, not the
  account, so `status` stays ACTIVE.
- `email_verified_at` is set without a verification email: the Super Admin
  asserts the address, and the audit record says the confirmation was
  administrative.
- **No access code is issued.** That is the next step, on Admin Access Codes.
  The panel that shows the temporary password once has a **Generate access
  code →** button that goes straight there with the Admin selected.

Any valid address works during development; the `@asiancollege.edu.ph`
restriction is off (`GOOGLE_DOMAIN_RESTRICTION_ENABLED=false`) and can be
switched on for production.

---

## Temporary passwords — shown again until they are replaced

The Super Admin can see an Admin's **temporary** password again from the
**Credentials** modal (Admin Accounts → Credentials, or Access Codes → View):

```
Temporary password   ••••••••••••••••   [ Show ]
                     → Tmp#Password2026x   [ Copy ] [ Hide ]
```

### How, without storing passwords

The login check is unchanged: `users.password` is a bcrypt hash and nothing
reverses it. A hash cannot answer "show it again", so when a temporary password
is issued (at creation or reset) the server **also** keeps an encrypted copy in
`temporary_credentials`:

- **AES-256-GCM** under `TEMP_CREDENTIAL_KEY`, a key held only in the server
  environment — never in the database. A database dump alone yields no password.
- Bound to that user's id: a sealed row copied onto another account will not open.
- Revealed only by `POST /api/admins/:id/temporary-password/reveal`: Super Admin
  session required, `no-store`, never in a URL, rate limited, and audited as
  `TEMP_PASSWORD_REVEALED` (the fact, never the value).

The copy is **destroyed** — the ciphertext emptied, not merely flagged — when:

| Event | Result |
| ----- | ------ |
| The Admin chooses their own password (change screen or emailed reset link) | `used_at`; audited `TEMP_PASSWORD_USED`. The modal shows **No active temporary password.** |
| The Super Admin resets it | The old one stops working *and* stops being revealable; the new one can be shown. |
| The reveal window passes (`TEMP_CREDENTIAL_REVEAL_HOURS`, default 72) | Can no longer be shown; the password itself still works. |

A **permanent** password is never stored in any recoverable form and can never
be shown.

**The honest limit:** this is encryption, not hashing, because "show it again"
requires it. Someone holding both a database dump *and* the key could read a
temporary password still inside its window. That exposure is bounded: the
password is temporary, must be changed at first sign-in, and is useless without
a separately issued access code.

### What the modal says, precisely

The modal never draws dots for a password it cannot actually show:

- **Available** — dots and **Show**.
- **No active temporary password.** — they chose their own; offers **Reset
  Temporary Password**.
- **A temporary password is set, but it can't be shown** — with the reason:
  issued before revealing existed (James Tan's current one), issued while
  `TEMP_CREDENTIAL_KEY` was unset, the window passed, or the key was rotated.
  **Reset Temporary Password** issues one that can be shown.

Without `TEMP_CREDENTIAL_KEY`, everything else works; temporary passwords are
simply shown once when issued, and the dashboard says revealing is not
configured.

## Issuing codes — Admin Access Codes

**Super Admin Dashboard → Admin Access Codes → Generate Access Code.**

Pick the Admin and an expiration (5, 10, 15, 30 or 60 minutes; the default is
`ADMIN_ACCESS_CODE_EXPIRATION_MINUTES`). Optionally email the code to them —
only the code is ever emailed, never a password.

The server generates six digits with `crypto.randomInt` (never `Math.random`),
stores only a bcrypt hash, and shows the digits **once** with **Copy Code**
and **Revoke**. Give the code to the Admin securely.

Rules the server enforces:

- **One Admin.** A code belongs to exactly one Admin. At sign-in it is looked up
  by the id of the account that passed the password step, never by the digits,
  so James's code typed into Maria's sign-in is simply wrong for Maria.
- **Only the newest works.** Generating a new code revokes that Admin's previous
  live code (reason: *replaced by a newer code*).
- **One use.** A successful sign-in stamps `used_at` in a conditional update, so
  two requests racing on one code cannot both win.
- **Expiry.** Past `expires_at` the code fails, and the Admin needs a new one.
- **Five wrong guesses** revoke the code. After that, even the right code fails.
- Only Admins who are set up and active can be picked. A suspended or
  never-set-up account is shown but disabled, with the reason.

### Statuses

| Status | Meaning |
| ------ | ------- |
| **ACTIVE** | Live: unused, unexpired, not revoked. Shows a countdown. |
| **USED** | Accepted at a sign-in. Can never work again. |
| **EXPIRED** | Ran out before anyone used it. |
| **REVOKED** | Withdrawn, with the reason shown: revoked by a Super Admin, replaced by a newer code, too many incorrect attempts, account suspended, or password reset. |

**View** opens the Credentials modal: the Admin and their account status, the
temporary password section (above), and the access code's status, creation,
issuer, expiry, use, revocation and attempts, with **Generate New Code** and
**Revoke**. **The access code itself is never shown again** — only a hash is
stored. Losing a code costs nothing: generate another.

**Revoke** is offered only for ACTIVE codes. A used or expired code already
cannot let anybody in, and revoking it would rewrite its history.

### The dashboard card

The dashboard's **Admin Access** card shows Active Admins, Active Access Codes,
Expired Codes and Used Codes, with **Manage Access Codes**, **Generate Access
Code** and **Admin Accounts** buttons, plus the security code's configured
status.

---

## The Admin's sign-in

```
STEP 1   email + password          → validated. NO session is created.
STEP 2   Administrator Access Verification
         "Your account requires an access code issued by the Super Admin."
         [ _ _ _ _ _ _ ]   Code expires in 09:41
                                   → code verified, session created
STEP 3   Create New Password       (while must_change_password is set)
         → Admin Dashboard
```

**There is no session between steps 1 and 2.** A half-finished sign-in is a row
in `admin_login_challenges`, named by an opaque HttpOnly cookie
(`tdms_admin_login`) whose SHA-256 is all that is stored. It grants nothing but
the right to submit a code. Issuing a session early and marking it
"unverified" was rejected because it recreates the redirect loop described at
the top of `src/middleware.ts`.

The account is re-checked at step 2, not trusted from step 1: an Admin who is
**suspended** in between is refused even with the correct password and code.

**Request New Access Code** on that screen issues nothing — an account that
could mint its own code has no second factor. It emails the Super Admins and
records `ADMIN_ACCESS_CODE_REQUESTED`.

### Temporary passwords

`must_change_password` is enforced server-side in two places: `requireUser()`
diverts every page to `/change-password`, and `requireApiUser()` refuses every
API route except `POST /api/auth/change-password`. Changing the password clears
it.

---

## Resetting a password — Admin Accounts

**Admin Accounts → Reset password → Reset password.** No security code.

A new temporary password is generated on the server and shown **once**. At the
same time:

- every session for that Admin is ended,
- any half-finished sign-in is dropped,
- any **live** access code is revoked (reason: *password reset*) — a code issued
  alongside the old password is part of the same set.

The Admin then needs the new temporary password **and** a new access code. The
panel links straight to Generate for them.

This is also how an account left over from the old invitation flow (unconfirmed
address, placeholder password) is set up: the reset confirms the address on the
Super Admin's authority and activates it. Such accounts show **Not set up** and
offer only Reset password until then. A reset never reactivates a SUSPENDED
account; that is its own action.

## Suspending

Suspending ends every session, drops any half-finished sign-in and revokes any
live code. A suspended Admin cannot sign in even with a correct password and a
correct code. Reactivating restores the account, not a credential: issue a new
code when they need one. Nobody can suspend their own account.

---

## Who may do what

`adminAccountPolicy` in `src/server/auth/policies.ts`: every operation on Admin
Accounts and Admin Access Codes is **Super Admin only**, checked with
`isSuperAdmin` directly. It is deliberately not `can(user, 'accounts.manage')`,
which the `admin` role holds — issuing your own second factor is not a second
factor.

The Super Admin does **not** manage staff (Teachers, Secretaries…); that is the
Admin's job. See `managesStaff()` in the same file.

---

## Audit trail

| Action | When |
| ------ | ---- |
| `ADMIN_CREATED` | An Admin account was created |
| `ACCESS_CODE_GENERATED` | A code was issued (with how many older codes it replaced) |
| `ACCESS_CODE_REVOKED` | A Super Admin revoked a code |
| `ACCESS_CODE_USED` | A code was accepted |
| `ACCESS_CODE_EXPIRED` | A sign-in found the code expired |
| `TEMP_PASSWORD_GENERATED` | A temporary password was issued with a new account |
| `TEMP_PASSWORD_RESET` | A Super Admin reissued one (with codes revoked) |
| `TEMP_PASSWORD_REVEALED` | A Super Admin showed one — every time |
| `TEMP_PASSWORD_USED` | The Admin replaced it with their own |
| `ADMIN_PASSWORD_ACCEPTED` | Step 1 passed — **not** a sign-in |
| `ADMIN_LOGIN_SUCCESS` / `ADMIN_LOGIN_FAILED` | Step 2 outcome, with the reason |
| `ADMIN_SUSPENDED` / `ADMIN_REACTIVATED` | Status changed |
| `ADMIN_ACCESS_CODE_REQUESTED` | An Admin asked for a new code |

Each records the actor, the target Admin, the time, and IP and user agent where
there is a request. **Never recorded:** passwords, access codes, the static
code, the encryption key, sealed ciphertexts, hashes of any of them, or API
keys. Older entries use earlier names: `ADMIN_ACCESS_CODE_*`,
`ADMIN_TEMP_PASSWORD_RESET`, `ADMIN_PASSWORD_RESET`, `ADMIN_TEMP_PASSWORD_REPLACED`.

## Rate limits

| Bucket | Budget | Keyed on |
| ------ | ------ | -------- |
| `admin-create` | 10 / hour | Super Admin |
| `admin-code-generate` | 30 / hour | Super Admin |
| `admin-code-target` | 10 / hour | Target Admin |
| `admin-code-revoke` | 60 / hour | Super Admin |
| `admin-temp-password` | 5 / hour | Target Admin |
| `admin-code-attempt` | 15 / 15 min | Admin signing in |
| `admin-code-attempt-ip` | 30 / 15 min | Client IP |
| `admin-code-request` | 3 / hour | Admin signing in |
| `temp-password-reveal` | 30 / hour | Super Admin |

Plus the per-code cap of 5 wrong guesses, and the ordinary login throttle on the
password step.

---

## Environment variables

```
SUPER_ADMIN_STATIC_CODE=                  # root secret; you supply it; never shown
TEMP_CREDENTIAL_KEY=                      # openssl rand -base64 32; enables Show
TEMP_CREDENTIAL_REVEAL_HOURS=72           # how long a temporary password can be shown
ADMIN_ACCESS_CODE_EXPIRATION_MINUTES=10   # default expiry offered in Generate
ADMIN_ACCESS_CODE_MAX_ATTEMPTS=5          # wrong guesses before a code is revoked
ADMIN_LOGIN_CHALLENGE_TTL_MINUTES=15      # how long a half-finished sign-in survives
GOOGLE_DOMAIN_RESTRICTION_ENABLED=false   # development: any valid email domain
```

A code can never last longer than 60 minutes, whatever is configured or
requested.

## Testing

`npm test` runs the in-memory suite, including `src/server/services/admin-accounts.test.ts`.

`npm run test:admins` walks all 20 acceptance criteria against a running server
and real database. It needs `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`,
creates two throwaway Admins, and deletes them when it finishes.

## Files

| File | What is in it |
| ---- | ------------- |
| `src/server/auth/admin-access-code.ts` | Generation, hashing, expiry options, the four statuses |
| `src/server/auth/super-admin-code.ts` | The static code: constant-time check, no default |
| `src/server/auth/credential-vault.ts` | Sealing temporary passwords for reveal |
| `src/components/AdminCredentialsModal.tsx` | The Credentials / Access Code modal |
| `src/server/auth/admin-login-challenge.ts` | The HttpOnly half-finished-sign-in cookie |
| `src/server/services/admin-account-service.ts` | Accounts, codes, revocation, the dashboard numbers |
| `src/server/services/admin-login-service.ts` | The Admin's side of the sign-in |
| `src/components/screens/AdminAccountsScreen.tsx` | Admin Accounts |
| `src/components/screens/AdminAccessCodesScreen.tsx` | Admin Access Codes |
| `src/app/(app)/dashboard/page.tsx` | The Admin Access card |
| `src/components/AdminAccessCodeForm.tsx` | Administrator Access Verification |
| `src/components/ChangeTemporaryPasswordForm.tsx` | Create New Password |
