# Google sign-in

TDMS accepts a Google-authenticated `@asiancollege.edu.ph` identity as proof
of who somebody is. It does not accept a typed email address as proof of
anything.

The distinction that runs through this whole document: **Google
authentication is not TDMS authorization.** Google telling us this really is
`jane.cruz@asiancollege.edu.ph` says nothing about whether her TDMS account is
allowed in. Those are separate decisions, made in that order.

## The flow

```
/login  -> "Continue with Google"
  GET /api/auth/google
    mint state + nonce + PKCE verifier -> HttpOnly cookies (10 min)
    302 -> accounts.google.com
  Google authenticates the person (we never see a password)
  GET /api/auth/google/callback?code=...&state=...
    compare state with the cookie          (CSRF)
    exchange code + PKCE verifier          (server-side, with the secret)
    verify the ID token signature via Google's JWKS
    check iss / aud / exp / nonce          (replay)
    check email_verified                    (Google's own check)
    check the domain, exactly               (server-side)
    one indexed user lookup -> one write -> one session
    302 -> /dashboard, or back to /login?error=...
```

Authorization Code flow with PKCE. The client secret never leaves the server
and never appears in a redirect URL.

### Why the ID token is verified rather than decoded

The token arrives over TLS from Google's token endpoint, authenticated with
our client secret, so tampering is already implausible. It is still verified
properly — signature against Google's published keys, plus `iss`, `aud`,
`exp` and `nonce` — because it costs one cached key fetch and removes the
need to reason about that at all. Google's keys rotate, so they are fetched
through `createRemoteJWKSet` rather than pinned.

### Why `state`, `nonce` and PKCE are all present

They defend different things, and dropping any one leaves a real hole:

| Mechanism | Stops |
| --------- | ----- |
| `state`   | An attacker feeding their own authorization code to your browser, binding your session to their Google account |
| `nonce`   | An ID token captured from one sign-in being replayed at the callback |
| PKCE      | An intercepted authorization code being redeemed by anyone but the client that started the flow |

`state` is compared in constant time, so it cannot be probed byte by byte.

### Why the transaction lives in cookies

The callback can land on a different serverless instance from the one that
started the flow, so server memory is not available. The three values sit in
HttpOnly cookies that expire in ten minutes, and are cleared on every exit
path — success or failure — so a PKCE verifier cannot be redeemed twice.

`SameSite` is `lax`, deliberately, **not** `strict`. The callback arrives as a
top-level redirect from `accounts.google.com`; `strict` would withhold the
cookies on exactly that request and every sign-in would fail with a state
mismatch. `lax` sends them on a top-level GET, which is this case and no
more.

## Scopes

`openid email profile`. Nothing else.

Signing somebody in requires their identity, not access to their mailbox. **No
Gmail scope is requested** — Google OAuth/OpenID and the Gmail API are
different things, and asking for Gmail permission to log somebody in would be
asking for far more than the application needs. A test asserts that no
Gmail, Drive or Calendar scope can creep in.

`access_type=online`, so no refresh token is issued. TDMS never acts on
anybody's behalf while they are away, so holding one would be keeping a
credential for no reason.

## What is stored

From the verified ID token only:

| Column          | From             | Why                                        |
| --------------- | ---------------- | ------------------------------------------ |
| `google_id`     | `sub`            | Stable join key. UNIQUE.                    |
| `email`         | `email`          | Normalised, UNIQUE                          |
| `first_name`    | `given_name`     | Display                                     |
| `last_name`     | `family_name`    | Display                                     |
| `avatar_url`    | `picture`        | Display                                     |
| `email_verified_at` | set when `email_verified` is true | Google's verification |
| `last_login_at` | server clock     | Operational                                 |

No Google password is stored, because none is ever seen. No access or refresh
token is stored. Nothing is logged beyond a failure's *reason* — never a
token, a code, a client secret or a Google error body, any of which can echo
request parameters.

**`sub` is the join key, not the email.** A person whose college address
changes is still the same person; matching on the address would create a
second account and split their records. The address is the fallback, which is
how an invited account gets linked on first use.

## First sign-in

A valid `@asiancollege.edu.ph` Google account that TDMS has never seen gets:

- `status = PENDING`
- `is_active = false`
- **no role at all** — not student, not anything

A role is an authorization decision, and holding a college mailbox is not
grounds for one. An administrator assigns the role and activates the account
from **Staff**. There is no path by which a self-registering visitor obtains
privileges, and a test asserts nothing role-shaped is written on this path.

The account also gets an unguessable placeholder password — a random value
hashed and discarded on the line that produces it — so the row is never
password-less and nobody can sign in to it with credentials.

## Repeat sign-in

One indexed lookup (`google_id`, falling back to `email`), one write, one
session insert. No second call to Google: everything needed is already in the
verified ID token.

`status` decides access:

| Status      | Result                                                    |
| ----------- | --------------------------------------------------------- |
| `ACTIVE`    | session created, redirect to `/dashboard`                   |
| `PENDING`   | refused — awaiting approval                                 |
| `INACTIVE`  | refused — deactivated                                       |
| `SUSPENDED` | refused — suspended                                         |

Every role lands on `/dashboard`, which renders per-role content behind the
same policies. There is no role-to-URL map that could fall out of step with
the roles table.

### Google sign-in cannot undo an administrative decision

A `PENDING` account is promoted to `ACTIVE` on Google sign-in **only if it
already has a role** — meaning an administrator deliberately invited it. That
is what lets invitations work with no mail provider at all: the invitation
established who should have access, and Google establishes that this is them.

`INACTIVE` and `SUSPENDED` are never promoted. Those are decisions somebody
made, and signing in with Google must not reverse them. Two tests exist
specifically to keep that true.

## Error handling

The callback never shows a technical failure. It redirects to
`/login?error=<code>` and the login page turns the code into a sentence:

| Code                      | Shown as                                                     |
| ------------------------- | ------------------------------------------------------------ |
| `cancelled`               | Google sign-in was cancelled.                                 |
| `wrong_domain`            | Only an @asiancollege.edu.ph account can access TDMS.         |
| `google_email_unverified` | That Google account has not verified its email address…       |
| `account_created_pending` | Your account has been created and is waiting for approval…    |
| `account_pending`         | Your account is not active yet…                               |
| `account_inactive`        | Your account is inactive. Please contact the administrator.   |
| `account_suspended`       | Your account has been suspended…                              |
| `invalid_state`           | That sign-in attempt could not be verified. Please try again. |
| `expired`                 | That sign-in attempt timed out. Please try again.             |
| `google_failed`           | Google sign-in failed. Please try again.                      |
| `google_unavailable`      | Google sign-in is not available…                              |

`cancelled` and the two pending codes are shown in a neutral tone, because
they are outcomes rather than faults.

## Google Cloud configuration

1. **Create or pick a project** — <https://console.cloud.google.com>.

2. **OAuth consent screen** (APIs & Services → OAuth consent screen)
   - User type: **Internal** if the project sits in the
     `asiancollege.edu.ph` Workspace organisation. Internal needs no Google
     verification review and is the right choice for a system only staff and
     students use.
   - External only if the project is outside the organisation; that requires
     verification before it leaves testing.
   - App name: `TDMS`. Support email: an institutional address.
   - Scopes: add **only** `openid`, `.../auth/userinfo.email`,
     `.../auth/userinfo.profile`. Add no Gmail scope — a project requesting
     one faces a far heavier review, for a permission this app never uses.

3. **Create an OAuth client** (Credentials → Create credentials → OAuth
   client ID)
   - Application type: **Web application**

   - Authorised redirect URIs — these must match `GOOGLE_REDIRECT_URI`
     exactly, including scheme, host, port and path:
     ```
     http://localhost:3000/api/auth/google/callback
     https://tdms-swart.vercel.app/api/auth/google/callback
     ```
     Add one per preview domain you intend to sign in from. Google matches
     literally; a trailing slash is a different URI.

   - Authorised JavaScript origins are **not required**. This is a
     server-side redirect flow, not Google Identity Services in the browser,
     so nothing calls Google from page JavaScript.

4. **Copy the client ID and secret** into the environment (below). The
   secret is a server credential: it belongs in Vercel's environment
   variables, never in the repository and never in anything the browser can
   read.

5. **Optional, recommended:** in the Workspace admin console, confirm the app
   is permitted for the organisation so staff do not see an unverified-app
   warning.

## Environment variables

```env
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://tdms-swart.vercel.app/api/auth/google/callback
```

All three are required together; if any is missing, Google sign-in is treated
as unconfigured, the button is not rendered, and `/api/auth/google` redirects
back with `google_unavailable`. Nothing crashes and no half-configured flow
is ever offered.

None is prefixed `NEXT_PUBLIC_`, so none reaches the browser. The client ID
is not secret, but there is no reason for the page to have it in this flow.

Local development uses `http://localhost:3000/...`; `secure` cookies are off
when `NODE_ENV` is not production, so the flow works over plain HTTP on
localhost.

Check what a deployment is actually using:

```bash
curl -s https://<deployment>/api/health | jq
```

## Credential sign-in is still present

The existing "Username or Email + Password" form is kept below the Google
button. Two reasons: staff invited before they link a Google account still
need it, and the institution may hold accounts that are not in Workspace.

The brief for this work said to drop password login "unless the existing
application explicitly requires it" — it does, and earlier instructions for
this project were explicit that the login page must not be redesigned. So
Google is the primary action and the form remains beneath it, on the same
branded panel, with nothing removed.

If you would rather Google were the only way in, that is a one-line change to
the login page plus a decision about how invited staff bootstrap; say so and
I will make it.
