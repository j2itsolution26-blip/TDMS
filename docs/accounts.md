# Accounts

TDMS has no demo accounts, no seeded administrator and no generated
passwords. Every account belongs to a real person on the institution's own
email domain, and every account proves control of that mailbox before it can
be used.

## The email domain policy

TDMS can restrict accounts to a single email domain. It is a **switch**, not a
hard-coded rule, and it is currently **OFF** for development.

| | `GOOGLE_DOMAIN_RESTRICTION_ENABLED=false` (now) | `=true` (launch) |
| --- | --- | --- |
| `user@asiancollege.edu.ph` | allowed | allowed |
| `user@gmail.com` | allowed | rejected |
| `user@notasiancollege.edu.ph` | allowed | rejected |
| `not-an-email` | rejected | rejected |

Two separate questions, deliberately kept apart in
`src/lib/institutional-email.ts`:

1. **Is this a well-formed address?** Always enforced. A malformed address is
   never acceptable, and letting one through puts junk in a UNIQUE column that
   somebody has to clean up by hand later.
2. **Is it on the allowed domain?** Only enforced when the switch is on.

Turn it on for launch:

```env
GOOGLE_DOMAIN_RESTRICTION_ENABLED=true
GOOGLE_ALLOWED_DOMAIN=asiancollege.edu.ph
```

Only an explicit `true`, `1`, `yes` or `on` enables it, so a typo leaves it
off rather than half-on. The value is read per call, so a deployment can
change it without a rebuild.

Check which way a deployment is set:

```bash
curl -s https://<deployment>/api/health | jq .domainPolicy
# { "enabled": false, "allowedDomain": "asiancollege.edu.ph",
#   "summary": "OPEN — any well-formed Google account is accepted (development setting)" }
```

### The default is OFF, and that is a fail-open default

Worth being explicit about, because fail-open defaults are usually wrong.

It is chosen because this project's development happens against the deployed
Vercel environment, where `NODE_ENV` is `production` — so keying the default
off `NODE_ENV` would restrict the very environment being developed in.

The cost is that a real launch which forgets the variable accepts any Google
account. Rather than leave that in a document nobody re-reads, the state is
reported by `/api/health` and described in words that are hard to misread
(`OPEN — …`). **Set it to `true` before the system carries real student
records.**

### Why the restriction stays implemented

Nothing was deleted to turn it off. The exact-match comparison, the lookalike
rejection and the normalisation are all still there and still tested — see
`src/lib/domain-policy.test.ts`, which exercises **both** switch positions,
and `src/lib/institutional-email.test.ts`, which covers the restricted
behaviour in detail. A switch only ever tested in one position is a switch
nobody can trust to be flipped.

When the restriction is on, the domain must match **exactly**. `endsWith` is
not sufficient, and that is the specific bug the implementation exists to
prevent:

| Address | Why it is rejected |
| --- | --- |
| `user@notasiancollege.edu.ph` | `endsWith` would accept it |
| `user@asiancollege.edu.ph.example.com` | the domain is a prefix, not the domain |
| `user@asiancollege-edu.ph` | hyphen substituted for a dot |
| `user@sub.asiancollege.edu.ph` | a subdomain is a different host |
| `user@asiancollege.edu.ph@evil.com` | split on the LAST `@`, so this is evil.com |

Addresses are normalised before validation and storage — trimmed and
lower-cased in full, local part included. SMTP permits case-sensitive local
parts, but no institution issues `J.Cruz@` and `j.cruz@` to two people, and
treating them as distinct would let one person hold two accounts and split
their records.

## Account states

`users.status` is authoritative:

| State                  | Meaning                                | Can sign in |
| ---------------------- | -------------------------------------- | ----------- |
| `PENDING_VERIFICATION` | created, email not yet confirmed        | no          |
| `ACTIVE`               | confirmed and permitted                 | **yes**     |
| `INACTIVE`             | deactivated by an administrator          | no          |
| `SUSPENDED`            | withdrawn for cause                      | no          |

Sign-in requires `status = ACTIVE` **and** `emailVerifiedAt` set. The two are
independent and both are checked, on every request rather than only at
sign-in — so deactivating someone ends their access immediately.

`users.is_active` is superseded but retained, so no migration had to drop a
column on a live database. Nothing reads it; every write goes through one
helper that sets both (`is_active = status === 'ACTIVE'`), so they cannot
drift. It is safe to drop when you want to.

## Getting the first administrator

A fresh installation has roles and permissions but **no users**. There are
two ways to create the first one, and neither involves a known password.

### 1. Web bootstrap — `/login` → "Create Super Admin"

Available only while no Super Admin exists, re-checked inside the transaction
so it cannot be raced. Two steps: the operator supplies their own name,
institutional email and password, then types a six-digit code emailed to that
address.

**Nothing is created until the code is verified.** The details wait in
`pending_admin_registrations` with the password already hashed — no `users`
row, no role, no session — and the account is created from that row only after
a correct code, in a transaction that deletes the row as it goes. The full
reasoning, and the attempt and resend caps, are in
[authentication.md](authentication.md#first-time-setup).

**This needs a working mail provider.** Without one the setup screen shows a
configuration error naming the variables to set and stops; it does not create
an administrator that cannot be verified.

### 2. `npm run admin:create` — when email is not configured yet

```bash
npm run admin:create -- --name "Maria Santos" --email maria.santos@asiancollege.edu.ph
```

The password is prompted for (hidden), or read from `ADMIN_PASSWORD`. Never
pass it as an argument — arguments appear in shell history and the process
list.

This exists to break a circular dependency: the web bootstrap needs email,
and configuring email needs somebody signed in. It is not a backdoor — it
requires shell access *and* the database credentials, which is a strictly
higher bar than any web flow; it invents no password; it enforces the same
domain and strength rules; it refuses to run if an administrator already
exists; and it writes an audit record naming itself. Marking the address
verified is justified because provisioning out-of-band is itself the proof of
control, the same reasoning behind `createsuperuser` elsewhere.

## Inviting everyone else

An administrator invites colleagues from **Staff**. No password is generated
and none is displayed, because there is no longer any moment at which
somebody other than the account holder knows it:

```
Administrator enters name + institutional email + role
   -> account created PENDING_VERIFICATION
   -> password column holds a discarded random value, so nobody can sign in as them
   -> verification email sent
   -> invitee opens the link
   -> address verified, status -> ACTIVE
   -> invitee chooses their own password
   -> invitee signs in
```

Administrators can also resend an invitation, send a password reset link,
deactivate, suspend and reactivate, change a role, and see verification
status for every account.

Changing an account's email address resets it to `PENDING_VERIFICATION`,
destroys its sessions and sends a fresh verification email. A new address is
unproven, so it has to be proven.

## Tokens

Verification and reset tokens share one implementation
(`src/server/auth/tokens.ts`) and one set of rules:

- 32 bytes from a CSPRNG;
- only the SHA-256 is stored, so a database dump yields no usable link.
  SHA-256 rather than bcrypt is right because the input already has 256 bits
  of entropy — there is nothing to brute force, and a slow hash would only
  slow down legitimate verification;
- single use, consumed with a conditional update inside a transaction, so two
  simultaneous clicks cannot both succeed;
- expiring — 24 hours for verification, 60 minutes for resets, both
  configurable;
- issuing a new one invalidates outstanding ones, so a forwarded old email
  stops working;
- a verification token records the address it was issued for, so a link
  cannot confirm an address the account has since moved away from.

Verification is a **POST**, not a GET on page load, so a mail scanner or link
previewer fetching the URL cannot burn the token.

## Sign-in messages

| Situation                        | Response                                                          |
| -------------------------------- | ----------------------------------------------------------------- |
| Address outside the domain       | `Only an @asiancollege.edu.ph account can access TDMS.`            |
| Wrong password, or no such account | `Invalid username/email or password.`                            |
| Institutional but unverified     | `Please verify your institutional email before signing in.`        |
| Deactivated                      | `Your account is inactive. Please contact the administrator.`      |
| Suspended                        | `Your account has been suspended. Please contact the administrator.` |
| Too many attempts                | `Too many login attempts. Please try again in N seconds.`          |

The order of checks matters. Verification and status are reported only
**after** the password has been verified; reporting them earlier would turn
those messages into an oracle for which addresses exist. A bcrypt comparison
runs even when no account matched, so timing cannot distinguish the two
either.

The domain message is safe to give unconditionally, because it is a statement
about the domain — identical for every address on it — and says nothing about
whether any account exists.

## Password reset

`/forgot-password` answers identically whether or not an account exists, and
is throttled on address plus IP. Setting a password through a link sent to a
verified address also completes an invitation, and destroys every other
session for that account.
