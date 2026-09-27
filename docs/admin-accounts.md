# Administrator accounts and access codes

Written for: whoever operates and maintains TDMS — the Super Admin who will use
this screen, and the next developer to touch the code behind it.

Administrator accounts are created by a Super Admin, not by invitation and not
by approval. A Super Admin sets a temporary password and issues a one-time
access code; the Admin signs in with the password, enters the code, and chooses
a permanent password. There is no pending-approval state anywhere in it.

---

## Why it works this way

The previous route to an Admin account was a staff invitation: an account was
created, an email went out, and it became active when somebody opened the link
and set a password. That made "who administers this system" a decision taken by
omission — nobody actively decided, and the only gate was a mailbox.

Three things changed, and each is a consequence of that:

**The Super Admin creates the account outright.** No invitation, no queue, no
approval. The decision is explicit and it is logged with a name against it.

**A password alone does not get an Admin in.** The password and the access code
are issued by the same person but travel separately and expire differently, so a
leaked password is not a sign-in. This is why there is no session between the
two steps — see below.

**Nothing is stored that could be read back.** The temporary password and the
access code are shown once and stored only as bcrypt hashes. That is a
deliberate trade: losing a code is an inconvenience (generate another), whereas
a retrievable credential is a permanent exposure.

---

## The two secrets, which are not the same thing

These are confused easily and the consequences of confusing them are bad, so
they are kept in different modules with different lifetimes.

|                | Super Admin security code | Admin access code |
| -------------- | ------------------------- | ----------------- |
| What it is     | One long-lived secret held by the system owner | Six digits, generated per account |
| Where it lives | `SUPER_ADMIN_STATIC_CODE` in the server environment | `admin_access_codes`, as a bcrypt hash |
| Who types it   | The Super Admin, when issuing credentials | The Admin, when signing in |
| Lifetime       | Until the owner changes it | 10 minutes, one use |
| Code           | `src/server/auth/super-admin-code.ts` | `src/server/auth/admin-access-code.ts` |

The security code is **never** accepted at the Admin sign-in step, and an access
code is never accepted in place of it. Using one for the other would collapse
them into a shared password.

### `SUPER_ADMIN_STATIC_CODE`

Required before a Super Admin may **create an Admin**, **generate an access
code** or **reset a temporary password** — the three operations that hand
somebody a working credential. It confirms the person at the keyboard is the
owner and not a borrowed session.

Suspending and reactivating deliberately do **not** ask for it: they issue
nothing, they are reversible, and suspending an account is the last thing
anybody should have to hunt for a secret before doing.

There is **no default and no fail-open path**. Until it is set, those three
operations refuse with an explanation. That is the safe direction for this
particular failure, and a shipped default would mean every deployment's master
confirmation code sits in this repository's git history.

Rules:

- Server-side only. **Never** prefix it `NEXT_PUBLIC_` — that inlines it into
  the browser bundle.
- Never committed with a real value, never written to the database, never
  returned by an API, never logged, never put in an audit record.
- Make it long and random: `openssl rand -base64 24`.

`/api/health` reports whether it is configured. It does not report the value,
its length, a prefix or a digest — any of which would narrow a guess.

---

## Setting it on Vercel

1. Generate one: `openssl rand -base64 24`.
2. Vercel → your project → **Settings** → **Environment Variables** → **Add**.
3. Name `SUPER_ADMIN_STATIC_CODE`, paste the value, tick **Production**,
   **Preview** and **Development** (whichever you want it to work in).
4. Save, then **redeploy** — environment variables are read at boot, so an
   existing deployment will not pick it up.
5. Confirm with `https://your-app.vercel.app/api/health`:

   ```json
   "adminAccessControl": {
     "superAdminSecurityCode": { "configured": true, "variable": "SUPER_ADMIN_STATIC_CODE" }
   }
   ```

Keep the value in a password manager. Nothing in TDMS can recover it, and
changing it takes effect on the next deployment.

### The other variables

```
ADMIN_ACCESS_CODE_EXPIRATION_MINUTES=10   # how long an issued code lives
ADMIN_ACCESS_CODE_MAX_ATTEMPTS=5          # guesses against one code
ADMIN_LOGIN_CHALLENGE_TTL_MINUTES=15      # how long a half-finished sign-in survives
```

At six digits the **attempt cap, not the length, is the security**: five guesses
against a million candidates is the protection. Raising `MAX_ATTEMPTS` much
above five gives that away, however long you make the code.

---

## Creating an Admin

**Administration → Admin Accounts → Create Admin.**

Full name, email address, a temporary password (**Generate password** produces
one), and the security code. Optionally tick *Email the access code to them*.

What happens on the server:

- The account is created **ACTIVE**, with the `admin` role, in one transaction
  with its first access code. Half of that is not a useful outcome.
- `must_change_password` is set. That is a fact about the *credential*; the
  account's `status` stays ACTIVE. Overloading a status with "has not finished
  setting up" is how a state called PENDING ends up labelled "pending approval"
  and meaning three different things.
- `email_verified_at` is set **without** sending a verification email. The Super
  Admin is typing an address for a colleague they are also handing a password
  to, so the address is asserted by them; an account that could not sign in
  until its holder opened a link would make those credentials useless. The audit
  record says the confirmation was `administrative`, so the trail does not claim
  the holder proved anything. A mistyped address is bounded: the temporary
  password is never emailed, so a wrong address can at most receive a code that
  is useless without it.
- The password is bcrypt-hashed; the code is bcrypt-hashed. Neither plaintext is
  stored.

The response shows both **once**. Copy them before closing. The code can be
regenerated freely; the password would have to be reset.

### Why the password is not emailed

Only the access code is ever emailed, and only if you ask. One mailbox must
never hold a complete set of credentials — that is the entire reason for
splitting them.

---

## The Admin's sign-in

```
email + password
      ↓  validated, and NO session is created
Administrator Verification  ──  enter the 6-digit access code
      ↓  code verified, session created
Choose a permanent password
      ↓
Dashboard
```

### There is no session between the two steps

This is the design decision most worth understanding before changing anything
here.

The obvious implementation is to issue a session at the password step and mark
it "not yet verified". That puts a credential in the browser that has to be
refused everywhere, and a cookie that middleware reads as "signed in" while the
application reads as "not signed in" is precisely the shape that produced the
`/login` redirect loop this codebase already fixed once (see the comment at the
top of `src/middleware.ts`).

So a half-finished sign-in is its own object: a row in
`admin_login_challenges`, named by an opaque handle in an HttpOnly cookie
(`tdms_admin_login`) of which only the SHA-256 is stored. It holds no session
and no role, and it authorises exactly one thing — submitting a code.

Consequences worth knowing:

- Only one challenge exists per account. A second sign-in supersedes the first,
  so a session left open on a machine somebody walked away from cannot be
  finished with a code issued for the machine they are using now.
- Eligibility is **re-read** at the code step. A Super Admin who suspends an
  Admin expects that to take effect now, not whenever the person submits a code.
- The "Remember me" tick is carried on the challenge row, because the session is
  created at step two.

### What refuses a code, and what it costs

| Situation | Reported as | Spends an attempt? |
| --------- | ----------- | ------------------ |
| Wrong code | `ACCESS_CODE_INCORRECT`, with attempts remaining | Yes |
| Not six digits | `ACCESS_CODE_MALFORMED` | **No** — a typo in the box is not a guess |
| Already used | `ACCESS_CODE_UNUSABLE` | n/a |
| Superseded by a newer code | `ACCESS_CODE_INCORRECT` | Yes — see below |
| Expired | `ACCESS_CODE_UNUSABLE` | n/a |
| Attempts spent | `ACCESS_CODE_UNUSABLE`, and the code is cancelled | n/a |
| No challenge cookie | `ADMIN_LOGIN_EXPIRED` | No |
| Account suspended or role removed | `ADMIN_NOT_ELIGIBLE` | No |

A **superseded** code is reported as simply wrong rather than as "cancelled",
and it does cost an attempt. That is not a rough edge: re-issuing empties the old
row's hash, so a superseded code *cannot be recognised* — and a system that
could recognise one is one refactor away from accepting it. From the server's
side the submission is a wrong guess, and a wrong guess spends a guess.

Once the attempt cap is reached the code is cancelled and **the correct code
stops working too**. At six digits that cap is the security, so it has to be
final.

### Request New Access Code

The button on the verification screen **issues nothing**. An account that could
mint its own second factor does not have one. It records an audit entry and, if
mail is configured, emails the active Super Admins to say who is waiting. The
screen says so, because a button that looks like it produces a code and instead
sends a message is worse than no button.

---

## Temporary passwords

`must_change_password` is enforced on the server, in two places, and neither can
be navigated around:

- `requireUser()` — called by the signed-in layout and every page in it —
  redirects to `/change-password`.
- `requireApiUser()` refuses every route with `PASSWORD_CHANGE_REQUIRED`, except
  `POST /api/auth/change-password`, which is the one endpoint that takes an
  `allowTemporaryPassword` opt-in.

`/change-password` lives **outside** the `(app)` route group on purpose. A page
inside it would call `requireUser()`, which redirects holders of a temporary
password there — that is, to itself, forever.

Changing the password through any path clears the flag: the rule has one exit,
whichever screen is used.

The current password is still required on that screen. It was typed minutes ago,
so it costs one field, and it means a browser left open there is not a way to
take the account over.

---

## Suspending

Suspending an Admin does three things at once, because the point of suspending
is that this person should not be in the system in a minute's time:

- sets `status = SUSPENDED`,
- destroys every session for the account,
- cancels any unused access code and drops any half-finished sign-in.

Reactivating restores the *account*, not a credential. Issue a fresh code when
you are ready to let them back in.

Nobody may suspend their own account. That is checked in the policy **and**
re-asserted in the service, because the `Gate::before` Super Admin blanket grant
would otherwise let a Super Admin lock the institution out of its own system.

---

## Who may do what

`adminAccountPolicy` in `src/server/auth/policies.ts`. Every operation is
**Super Admin only**, checked with `isSuperAdmin` directly.

Note what it does *not* use. The obvious check would be
`can(user, 'accounts.manage')` — and it would be wrong twice over: the `admin`
role holds that permission, so an Admin could create peers and issue their access
codes, and issuing your own second factor is not a second factor.

The reverse holds as well: the Super Admin does **not** manage staff. Creating
Admins is system maintenance; staffing the institution is the Admin's job, so
the Staff screen is hidden from the Super Admin and its routes refuse them. See
`managesStaff()` in the same file.

The `admin` role is also no longer grantable from the **Staff** screen by
anybody, including a Super Admin. Leaving it there would give the system two ways
to create the same privileged account — one of which grants it by emailing a link
and asking nobody for a second factor — and the weaker of two routes is the one
that gets used. Existing Admin accounts are listed and managed on their own
screen.

---

## The audit trail

Written to the existing `audit_logs` table, interleaved with everything else.

| Action | When |
| ------ | ---- |
| `ADMIN_CREATED` | A Super Admin created an account |
| `ADMIN_ACCESS_CODE_GENERATED` | A code was issued or re-issued |
| `ADMIN_ACCESS_CODE_USED` | A code was accepted |
| `ADMIN_ACCESS_CODE_EXPIRED` | A submission found the code expired |
| `ADMIN_ACCESS_CODE_REQUESTED` | An Admin asked for a replacement |
| `ADMIN_TEMP_PASSWORD_RESET` | A Super Admin issued a new temporary password |
| `ADMIN_TEMP_PASSWORD_REPLACED` | The Admin replaced it with their own |
| `ADMIN_PASSWORD_ACCEPTED` | Step one passed — **not** a sign-in |
| `ADMIN_LOGIN_SUCCESS` | Both factors passed |
| `ADMIN_LOGIN_FAILED` | A code was refused, with the reason |
| `ADMIN_SUSPENDED` / `ADMIN_REACTIVATED` | Status changed |
| `SUPER_ADMIN_SECURITY_CODE_REJECTED` | A wrong security code on a privileged operation |

`ADMIN_PASSWORD_ACCEPTED` is recorded as a step, not a success. An Admin is not
signed in at that point, and a trail that said otherwise would be wrong about the
one thing it exists to be right about.

**Never recorded:** passwords, access codes, the security code, hashes of any of
them, or the value of a rejected guess. An audit table full of near-miss guesses
is a wordlist for the real code.

---

## Rate limits

All stored in the legacy `cache` table, because serverless functions share no
memory and an in-process counter would reset on every cold start and throttle
nothing.

| Bucket | Budget | Keyed on |
| ------ | ------ | -------- |
| `super-admin-code` | 5 per 15 min | Acting Super Admin |
| `admin-create` | 10 per hour | Acting Super Admin |
| `admin-code-generate` | 30 per hour | Acting Super Admin |
| `admin-code-target` | 10 per hour | Target Admin |
| `admin-temp-password` | 5 per hour | Target Admin |
| `admin-code-attempt` | 15 per 15 min | Admin signing in |
| `admin-code-attempt-ip` | 30 per 15 min | Client IP |
| `admin-code-request` | 3 per hour | Admin signing in |

A correct security code clears its own counter, so an operator who mistyped once
and then got it right is not still one slip from a lockout.

---

## Testing the whole workflow

Set `SUPER_ADMIN_STATIC_CODE` in `.env` first, or every credential-issuing
action will refuse (which is itself worth seeing once).

1. **Sign in as a Super Admin.** If none exists, `/create-super-admin` or
   `npm run admin:create`.
2. **Administration → Admin Accounts → Create Admin.** Use any valid address —
   the domain restriction is off in development. Press **Generate password**,
   enter the security code, submit.
3. **Copy the temporary password and the access code** from the panel. Close it
   and confirm they are gone for good.
4. **Sign out. Sign in as the Admin** with that email and temporary password.
   You land on Administrator Verification, and — check this — there is no
   session: opening `/dashboard` in another tab sends you to `/login`.
5. **Enter the code.** You land on the change-password screen. Check `/staff`
   and `/dashboard` both bounce you back here.
6. **Choose a permanent password.** You land on the dashboard.
7. **Sign in again** with the new password. You are asked for a code again and
   have none — the first one was single use.

Failure paths worth walking:

- Submit a wrong code five times and watch the attempts count down, then the
  code cancel itself — and the *correct* code stop working.
- Generate a new code as the Super Admin, then try the previous one.
- Let a code expire (`ADMIN_ACCESS_CODE_EXPIRATION_MINUTES=1` makes this quick).
- Suspend the Admin while they are sitting on the verification screen.
- Enter a wrong security code and check `audit_logs` — the entry is there and
  your guess is not.

The automated equivalents live in
`src/server/services/admin-accounts.test.ts` (50 tests against an in-memory
database), plus `src/server/auth/admin-access-code.test.ts`,
`src/server/auth/super-admin-code.test.ts`,
`src/lib/temporary-password.test.ts` and the `adminAccountPolicy` group in
`src/server/auth/policies.test.ts`. Run `npm test`.

---

## Files

| File | What is in it |
| ---- | ------------- |
| `src/server/auth/admin-access-code.ts` | Code generation, hashing, lifetime, the refusal classifier |
| `src/server/auth/super-admin-code.ts` | The static code: constant-time comparison, no default |
| `src/server/auth/admin-login-challenge.ts` | The HttpOnly handle cookie |
| `src/lib/temporary-password.ts` | The generator, shared by browser and server |
| `src/server/services/admin-account-service.ts` | The Super Admin's operations |
| `src/server/services/admin-login-service.ts` | The Admin's half of the sign-in |
| `src/components/screens/AdminAccountsScreen.tsx` | Administration → Admin Accounts |
| `src/components/AdminAccessCodeForm.tsx` | Administrator Verification |
| `src/components/ChangeTemporaryPasswordForm.tsx` | The forced password change |
| `prisma/migrations/20260927000000_admin_access_codes/` | The migration |
