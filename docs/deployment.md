# Deployment

TDMS is a Node.js application: one Fastify server that answers the API
(`/api/v1/…`) and serves the built React app for every other path. It needs
Node 22 or later, a PostgreSQL database and the environment variables in
`.env.example`.

## Build and run

```bash
npm ci                 # install exactly what package-lock.json pins
npm run build          # prisma generate + Vite build (client/dist) + server bundle (server/dist)
npm run db:migrate     # apply migrations to the target database
npm start              # node server/dist/server.js — listens on PORT (default 3000)
```

`npm start` reads `.env` if one exists; on a host, set the variables in its
environment instead. In production set `NODE_ENV=production`: it marks the
session cookie `Secure` and refuses development-only settings.

## Where to host it

Any host that runs a long-lived Node process works unchanged — Render,
Railway, Fly.io, a VPS behind nginx, or a container. The server trusts
`X-Forwarded-*` headers, so it can sit behind the host's proxy or load
balancer, and it serves its own static files.

**Vercel:** the Next.js deployment this project used to have no longer
applies — `vercel.json` now sets `"framework": null` so the old Next.js
preset is not used. Running the Fastify server on Vercel needs a
serverless entry point that wraps `buildApp()` from `server/src/app.ts`
and static hosting for `client/dist`; that adapter is not part of this
repository yet. Until it is, deploy to a Node host.

### Keep the server next to the database

Put the server in the same region as the Neon database. Every page issues
several queries; across an ocean each one costs roughly 200 ms, which adds
up to seconds per page and can exceed Prisma's transaction limits. The
current Neon database is in `us-east-2` (Ohio); `vercel.json` still names
`sin1` (Singapore) from an earlier database and must be changed to match if
Vercel is used again. The region codes are listed at
https://vercel.com/docs/regions.

## Commands

```bash
npm install          # install
npm run dev          # app on http://localhost:3000 (Vite), API on :3001 (Fastify)
npm run build        # prisma generate + client and server builds
npm start            # production server
npm test             # unit tests (Vitest)
npm run typecheck    # tsc for server and client
```

Database:

```bash
npm run db:migrate       # prisma migrate deploy
npm run db:seed          # roles, permissions, credential requirements
npm run db:generate      # regenerate the Prisma client
```

`npm run build` runs `prisma generate` first, which matters on Vercel: the
client is generated into `node_modules` and would otherwise be missing or
stale in the build cache.

## Environment variables

| Variable                   | Required | Notes                                                      |
| -------------------------- | -------- | ---------------------------------------------------------- |
| `DATABASE_URL`             | yes*     | PostgreSQL connection string, pooled. *See the fallback below |
| `NODE_ENV`                 | yes      | `production` on Vercel; drives the `secure` cookie flag     |
| `SESSION_LIFETIME_MINUTES` | no       | Default 120                                                 |
| `BCRYPT_ROUNDS`            | no       | Default 12 — cost for one-time codes; passwords use Argon2id |
| `GOOGLE_DOMAIN_RESTRICTION_ENABLED` | no | Default **false** (open). Set `true` for launch            |
| `GOOGLE_ALLOWED_DOMAIN`    | no       | Enforced domain when the above is true                      |
| `DEV_AUTO_ACTIVATE_GOOGLE_USERS` | no | Default false. Development only; grants no role             |
| `APP_URL`                  | yes*     | Absolute base for links in email. *Once email is enabled    |
| `RESEND_API_KEY`           | yes*     | *The production mail transport. Server-side only            |
| `EMAIL_FROM`               | yes*     | *Complete From header. Domain must be verified with Resend  |
| `EMAIL_PROVIDER`           | no       | `resend` \| `smtp` \| `development`. Derived when unset       |
| `MAIL_HOST`                | no       | SMTP host, if used instead of Resend. **Never loopback when deployed** |
| `MAIL_PORT`                | yes*     | *With `MAIL_HOST`. 587 for STARTTLS, 465 for implicit TLS   |
| `MAIL_USERNAME`            | no       | Omit only for a relay that needs no authentication          |
| `MAIL_PASSWORD`            | no       | With `MAIL_USERNAME`. Never committed                       |
| `MAIL_ENCRYPTION`          | no       | Derived from the port when unset                            |
| `MAIL_FROM_ADDRESS`        | no       | Superseded by `EMAIL_FROM`; still read for older deployments |
| `MAIL_FROM_NAME`           | no       | Display name on the From header                             |
| `MAIL_FROM`                | no       | Deprecated pre-composed form, honoured if the pair is unset  |
| `GOOGLE_CLIENT_ID`         | yes*     | *Required for Google sign-in; see google-auth.md            |
| `GOOGLE_CLIENT_SECRET`     | yes*     | *Server-only, never NEXT_PUBLIC_                            |
| `GOOGLE_REDIRECT_URI`      | yes*     | *Must match the OAuth client exactly                       |
| `EMAIL_VERIFICATION_TTL_HOURS` | no   | Default 24                                                 |
| `PASSWORD_RESET_TTL_MINUTES`   | no   | Default 60                                                 |
| `SUPER_ADMIN_CODE_TTL_MINUTES` | no   | Default 10 — the setup code's lifetime                     |
| `SUPER_ADMIN_CODE_MAX_ATTEMPTS` | no  | Default 5 wrong guesses per code                            |
| `SUPER_ADMIN_CODE_MAX_RESENDS` | no   | Default 3 codes per registration                            |
| `SUPER_ADMIN_CODE_RESEND_COOLDOWN_SECONDS` | no | Default 60                                       |
| `SUPER_ADMIN_COMPLETION_WINDOW_MINUTES` | no | Default 30 after verification                         |
| `BLOB_READ_WRITE_TOKEN`    | yes*     | *For lesson plan / TOS / PT uploads. Set by Vercel when a Blob store is connected. Server-only |
| `BLOB_ACCESS`              | no       | `private` (default) or `public`, matching how the Blob store was created |
| `FILE_STORAGE`             | no       | `local` keeps uploads in `.data/uploads` — **self-hosted servers with a persistent disk only**; ignored on Vercel |
| `APP_TIMEZONE`             | no       | Default `Asia/Manila`. Class schedules, attendance and quiz windows are read in it |

Nothing secret is exposed to the browser: no variable is prefixed
`NEXT_PUBLIC_`, and `DATABASE_URL` is only ever read inside `server-only`
modules.

### File uploads

Diploma Instructors upload lesson plans, Tables of Specifications and
Performance Task documentation (PDF, Word, Excel, PowerPoint or images, up to
4 MB, checked by content as well as extension). On Vercel they are stored in
**Vercel Blob**: connect a Blob store to the project (Storage → Blob) and
Vercel sets `BLOB_READ_WRITE_TOKEN`. Files are private; they are only served
through `/api/v1/documents/[id]/file`, which checks who is asking.

Until a store is connected, uploads are refused with "File storage is not
configured" and a document cannot be submitted for review — nothing is
accepted and then lost. The rest of the Instructor module works without it.

### If only the Laravel DB_* variables are set

`DATABASE_URL` is the one variable this application wants. But the Vercel
project was originally configured for the Laravel deployment, which supplied
the connection as separate parts, and those are still there:

```
DB_HOST  DB_PORT  DB_DATABASE  DB_USERNAME  DB_PASSWORD  DB_SSLMODE
```

Rather than require the same password to be copied into a second variable by
hand, the runtime composes a connection string from those parts when
`DATABASE_URL` is absent (`src/lib/database-url.ts`). Same credentials, same
database, one fewer place for a secret to live and be mistyped.

Precedence is simply: `DATABASE_URL` if set, otherwise the parts. Check which
one is in play:

```bash
curl -s https://<deployment>/api/v1/health | jq .databaseUrlSource
# "DATABASE_URL" | "DB_* parts" | "none"
```

Credentials are percent-encoded when composed, which matters more than it
sounds: an unescaped `@` or `/` in a password does not raise an error, it
silently parses as a different host or database and reports back as "cannot
reach the server". `src/lib/database-url.test.ts` pins that behaviour.

This is a migration shim, not the destination. Setting `DATABASE_URL` and
deleting the `DB_*` variables is tidier, and the fallback then stops being
reachable. The Prisma **CLI** always reads `DATABASE_URL` from
`schema.prisma`, so a machine running migrations needs it regardless.

### Connection pooling

Serverless functions each open their own connection. Use the **pooled**
Neon host (the `-pooler` one, already in `DATABASE_URL`) or the database
will run out of connections under any real load.

## Diagnosing a deployment

`GET /api/v1/health` is unauthenticated and reports whether the database is
reachable, the Prisma error code if it is not, and whether each required
environment variable is set — booleans and codes only, never a value:

```bash
curl -s https://<deployment>/api/v1/health | jq
```

`"env": { "DATABASE_URL": false }` means the variable is simply not set for
that environment, which is the single most likely cause of a deployment
where every page 500s while static pages work. See `authentication.md` for
the full table of responses.

### Account lifecycle suite

This one reads a real delivered email, so it needs a local SMTP catcher —
[Mailpit](https://mailpit.axllent.org/) or MailHog. Both listen for SMTP on
1025 and serve an HTTP API on 8025.

```bash
mailpit                                            # in one shell

MAIL_HOST=127.0.0.1 MAIL_PORT=1025   MAIL_FROM_ADDRESS=no-reply@asiancollege.edu.ph   npm run dev                                      # in another

npm run test:accounts                              # in a third
```

`scripts/e2e/institutional-auth.mjs` walks the acceptance list: domain
rejection on invite and on sign-in, invitation, the pending state, the
verification link, single-use tokens, password choice, sign-in, deactivate,
suspend, reactivate, and the non-enumerating forgot-password response.

It creates and then deletes a throwaway `@asiancollege.edu.ph` account, so it
refuses a non-local `BASE` unless `ALLOW_REMOTE=1`. Point `MAIL_CATCHER_URL`
at the catcher if it is not on `http://127.0.0.1:8025`.

It used to scrape the verification link out of the dev server's log, via
`DEV_LOG`. That worked because the mailer had a log transport; it does not any
more, because that transport put live credentials in the logs and reported
success while delivering nothing. A catcher is a real SMTP server, so this now
exercises the same path production uses.

### Session regression suite

```bash
npm run dev            # in one shell
npm run test:e2e       # in another
```

`scripts/e2e/session-redirect.mjs` covers the login/dashboard handoff: a
garbage cookie, an expired cookie, the authenticated redirect, a
mid-session deactivation, and `/api/v1/health`. It deactivates and restores
the `teacher` demo account, so it refuses to run against a non-local
`BASE` unless you pass `ALLOW_REMOTE=1`.

### Production smoke test

```bash
npm run test:prod                                  # defaults to the live URL
BASE=https://your-preview.vercel.app npm run test:prod
```

`scripts/e2e/production-flow.mjs` signs in as each of the seven demo roles
over HTTPS and checks the whole path: login by username and by email,
dashboard render, refresh, logout, re-login, protected-route redirects,
rejection of bad credentials, and the cookie flags including `Secure`.

It is safe to point at production: it only creates and destroys its own
sessions, and writes nothing else.

## Email delivery

Invitations, email verification, password resets and the Super Admin setup code
all need real mail. **Resend** is the production transport; SMTP remains for an
institutional mail server. There is no silent fallback.

| Transport | Chosen when | Notes |
| --------- | ----------- | ----- |
| `resend` | `RESEND_API_KEY` is set, or `EMAIL_PROVIDER=resend` | HTTP API. No outbound SMTP, nothing to keep warm. **Production** |
| `smtp` | `EMAIL_PROVIDER=smtp`, or `MAIL_HOST`+`MAIL_PORT` with no Resend key | Any SMTP server. STARTTLS is required, not merely offered |
| `log` | `EMAIL_PROVIDER=development` | Writes the code to the server log. **Refused when `NODE_ENV=production`** |
| `none` | nothing usable is configured | Sending **fails**. Nothing is queued |

`EMAIL_FROM` is required alongside either real transport; without a sender
address mail counts as unconfigured. `MAIL_FROM_ADDRESS`/`MAIL_FROM_NAME` and
the pre-composed `MAIL_FROM` are still read, in that order, so an older
deployment keeps its sender.

### Why Resend takes precedence over SMTP

This is a fix, not a preference. Selection used to be "SMTP if `MAIL_HOST` is
set, else Resend", and a deployment that had once been pointed at a local mail
catcher still carried `MAIL_HOST=127.0.0.1` in its Vercel environment. SMTP
therefore won, and every send in production tried to reach a mail server inside
the serverless function's own sandbox — where nothing is listening and nothing
ever could be. Verification email stopped working, and the failure looked like
a network problem rather than the stale variable it was.

So a Resend key now wins by default and a leftover SMTP host cannot hijack
delivery. Specifically:

* with a Resend key present, a loopback `MAIL_HOST` is **ignored**, and
  `/api/v1/health` reports it as a warning so the stale value can be seen and
  removed;
* with no key, a loopback `MAIL_HOST` on a deployment is a **configuration
  fault**, named as such, rather than a connection attempt that cannot succeed;
* `EMAIL_PROVIDER=resend` without a key resolves to `none`. It never falls
  through to SMTP — falling through is how a deployment ends up on a host
  nobody chose.

`EMAIL_PROVIDER=smtp` is the only way to get SMTP while a key is present.

### Setting it up on Vercel

Environment variables in Vercel are per-environment and are read at build and
run time, so **a change does nothing until a redeploy picks it up**. Editing
`.env` locally has no effect on a deployment.

1. Project Settings → Environment Variables. Add, for Production, Preview and
   Development:

   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
   EMAIL_FROM=TDMS <no-reply@yourdomain.com>
   EMAIL_PROVIDER=resend
   ```

2. **Remove `MAIL_HOST`** (and the other `MAIL_*` values) from the deployment,
   unless an institutional SMTP server is genuinely in use. They are inert once
   Resend is configured, but a loopback value left there is what caused the
   outage this section describes.
3. Redeploy.
4. Confirm what the deployment actually resolved:

   ```bash
   npm run mail:check -- --base https://your-app.vercel.app
   ```

   It reads the target's own `/api/v1/health`, then asks Resend for its verified
   domains and compares them with `EMAIL_FROM`. It sends nothing and prints no
   secret. `transport: resend` with `MAIL_HOST` still listed is the evidence
   that the stale value is no longer being used.

### Diagnosing a failure

Every outcome is logged in one fixed shape, so it can be found in the Vercel
log without knowing what to grep for:

```
[EMAIL]
Provider: Resend
Status: FAILED
Reason: The example.com domain is not verified. Please verify a domain before sending.
code: EMAIL_SENDER_NOT_VERIFIED
```

The `Reason` is the provider's own words — which is the point, because
"couldn't send" is not a diagnosis. Email addresses are redacted from it first:
Resend quotes the recipient in some refusals, and a verification recipient does
not belong in a log. Domains survive, because a domain is not a secret and is
usually the whole answer. The API key, the SMTP password, the message body and
the verification code are never logged by any path.

The browser gets the calm sentence — "We couldn't send the verification email.
Please try again." — plus a `code` in the JSON envelope, so a failure can be
identified from the Network tab alone:

| Code | Means | Fix |
| ---- | ----- | --- |
| `EMAIL_SERVICE_NOT_CONFIGURED` | no usable transport | set `RESEND_API_KEY` and `EMAIL_FROM` |
| `EMAIL_AUTH_FAILED` | the provider rejected the key | new key, or check it was copied whole |
| `EMAIL_SENDER_NOT_VERIFIED` | the provider will not send **from** `EMAIL_FROM` | verify the domain, or use `onboarding@resend.dev` |
| `EMAIL_RECIPIENT_NOT_ALLOWED` | Resend testing mode: only the account owner may be written **to** | verify a domain and change `EMAIL_FROM` |
| `EMAIL_RATE_LIMITED` | the provider is throttling | wait and retry |
| `EMAIL_PROVIDER_REJECTED` | anything else the provider refused | read the `Reason:` line |
| `EMAIL_CONNECTION_FAILED` | the provider could not be reached | DNS or egress |
| `EMAIL_TIMEOUT` | no response in time | retry; check the host |

One Resend quirk worth knowing, because it is confirmed against the live API
and defeats the obvious check: a **malformed** key returns `400` with
`"API key is invalid"`, while a **missing** key returns `401`. Classification
therefore reads the response body rather than trusting the status.

### Sender domain

Whichever transport you use, the address in `EMAIL_FROM` must be one the
provider is authorised to send for, with SPF and DKIM published for that
domain. Institutional mail is filtered hard; a mismatched sender is the usual
reason a code "never arrives" when the application reports it as delivered.

With Resend this is enforced: add the domain under Domains, publish the DNS
records it gives you, and wait for `verified`. `npm run mail:check` compares
`EMAIL_FROM` against the verified list, so a bad sender is caught before a user
meets it.

### Resend testing mode — the wall every new account hits

A Resend account with **no verified domain** can still send, using the shared
sender `onboarding@resend.dev`:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_FROM="TDMS <onboarding@resend.dev>"
```

The catch is the **recipient**, not the sender: such an account may only deliver
to the email address that owns the Resend account. Anything else is refused:

```
403 You can only send testing emails to your own email address (owner@example.com).
    To send emails to other recipients, please verify a domain at resend.com/domains…
```

The application reports that as `EMAIL_RECIPIENT_NOT_ALLOWED`, kept separate
from `EMAIL_SENDER_NOT_VERIFIED` on purpose — the two look alike and have
opposite fixes, and being told to "verify your sender" when the sender is fine
sends you to repair something that is not broken.

What this means in practice while developing:

* first-administrator setup works, **provided the administrator's email is the
  Resend account owner's address**;
* inviting anybody else from the Staff screen creates the account as `PENDING`
  and reports that the invitation could not be sent. That is correct behaviour,
  not a bug: the invitee cannot sign in, and "Resend invite" will deliver once a
  domain is verified;
* to email anyone else, verify a domain and change `EMAIL_FROM` to an address on
  it. Nothing in the application changes.

## A migration that exists is not a migration that ran

The registration flow once failed with a bare "Something went wrong" because
`prisma/migrations/..._pending_admin_registrations` had been written and
committed but never applied. Prisma raised P2021 ("table does not exist"), the
error wrapper had no specific handling for it, and the generic message hid the
one fact that would have explained it.

Two things changed as a result:

1. **`/api/v1/health` is not enough on its own** — it reports that the database is
   reachable, which it was. After pulling schema changes, check that they are
   actually applied:

   ```bash
   npx prisma migrate status
   npm run db:migrate      # if anything is pending
   ```

2. **Database faults now describe themselves.** A missing table or column
   returns 503 with "The database schema is out of date … Pending migrations
   need to be applied." An unreachable host says so. Credentials rejected
   points at configuration. None of these messages contains a table name, a
   host, a credential or any part of Prisma's own text — those go to the
   server log. See `src/server/api-handler.test.ts`.

## Resend: the sender is constrained until a domain is verified

With **no verified domain** on the Resend account, two limits apply, and both
look like application bugs if you do not know about them:

- the sender must be exactly `onboarding@resend.dev`; any other address is
  refused, surfacing as `EMAIL_SENDER_NOT_VERIFIED`;
- messages are only delivered to the Resend account owner's own address.

So this works immediately, for setup and testing:

```env
RESEND_API_KEY=re_...
EMAIL_FROM="TDMS <onboarding@resend.dev>"
```

and `EMAIL_FROM="TDMS <no-reply@asiancollege.edu.ph>"` does **not**, until
`asiancollege.edu.ph` (or a subdomain such as `tdms.asiancollege.edu.ph`) is
added in Resend and its DNS records are published. Verify the domain before
inviting anyone other than yourself, or their invitations will be accepted by
the API and never arrive.

Check what the account currently allows:

```bash
curl -s -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains
```

`RESEND_API_KEY` and `MAIL_HOST` must not both be set: SMTP takes precedence,
so leaving a stale `MAIL_HOST` in place silently ignores the Resend key.

## Diagnosing a mail failure

`/api/v1/health` reports the mail configuration — enough to place a problem
without reading the server log, and with no secret in it:

```bash
curl -s https://<deployment>/api/v1/health | jq .mail
```

```jsonc
{
  "transport": "smtp",          // smtp | resend | log | none
  "canSend": true,
  "senderConfigured": true,
  "host": "smtp.gmail.com",     // hostname only; not a secret
  "port": "587",
  "credentials": { "username": true, "password": true },  // presence only
  "resendApiKey": false,
  "developmentMode": false
}
```

A failed send answers with a **code** alongside the user-facing message, so
the cause is visible in the Network tab:

| Code | Means | Fix |
| --- | --- | --- |
| `EMAIL_SERVICE_NOT_CONFIGURED` | no transport at all | set `MAIL_*` or `RESEND_API_KEY` |
| `EMAIL_AUTH_FAILED` | username/password rejected | for Gmail/Workspace an **App Password** is required; an ordinary account password will not work |
| `EMAIL_SENDER_NOT_VERIFIED` | provider refuses that sender | verify the sender or its domain with the provider |
| `EMAIL_CONNECTION_FAILED` | host unreachable | check host, port, and that outbound SMTP is permitted |
| `EMAIL_TIMEOUT` | no response in time | usually a blocked port |
| `EMAIL_PROVIDER_REJECTED` | server refused the message | read the server log |
| `DATABASE_ERROR` | recognised Prisma fault | see the section above |

None of these carries a host, credential or provider text — that goes to the
server log only.

### A loopback MAIL_HOST cannot work when deployed

This caught out the Vercel deployment: `MAIL_HOST` was `127.0.0.1` and
`MAIL_PORT` `2525` — almost certainly copied from a local mail catcher. On a
serverless function, loopback is the function's own sandbox, where nothing is
listening, so every send failed with a connection error that reads like a
network fault rather than the configuration mistake it was.

It is now detected and named: deployed runtimes refuse a loopback
`MAIL_HOST` up front with an explanation, instead of attempting a connection
that cannot succeed. A loopback host remains perfectly valid in local
development, where Mailpit or MailHog is a normal setup.

## Development email mode

With no mail provider configured, registration correctly refuses rather than
pretending to send. For local work:

```env
EMAIL_VERIFICATION_MODE=development
```

The verification code is then written to the server log in a block that
announces itself, and the flow can be completed normally.

It requires an explicit opt-in **and** `NODE_ENV` not being `production`. The
second condition cannot be overridden: a verification code in a production log
is a credential sitting somewhere far more people can read than the mailbox it
was meant for. Asked for in production it is refused, and the refusal is
logged so nobody is left believing it is on.

Note for this project specifically: the Vercel deployment runs with
`NODE_ENV=production`, so development mode will **not** activate there even if
the variable is set. Use a real provider on Vercel, or `npm run admin:create`
to provision the first administrator without email.

## Fresh installation

```bash
npm run db:migrate                                # schema
npm run db:seed                                   # roles, permissions, requirements
npm run admin:create -- --name "..." --email you@asiancollege.edu.ph
```

To clear an existing database back to that state - deleting all accounts and
academic records, keeping roles, permissions and credential requirements:

```bash
CONFIRM_DB_FRESH=<database-name> npm run db:fresh
```

Two guards, and the second is the one that matters: it refuses if `NODE_ENV`
is production, **and** it refuses unless `CONFIRM_DB_FRESH` names the target
database exactly. A `NODE_ENV` guard alone would be nearly useless here,
because the dangerous case is a developer machine with `NODE_ENV` unset
pointed at a production `DATABASE_URL` - which is the situation this project
has been in throughout.

There is no `db:seed:demo`. The system has no demo accounts by design; see
[accounts.md](accounts.md).

## Scheduled work

Laravel's queue and scheduler tables exist but were never used — there are
no jobs, no commands beyond the framework's own, and nothing in
`routes/console.php`. Nothing was therefore dropped.

Three pieces of housekeeping do exist, all hygiene rather than correctness —
every one of these rows is already rejected on sight and deleted when
encountered. To reclaim the space on a schedule, call the following from a
Vercel Cron:

* `pruneExpiredSessions()` — `src/server/auth/session.ts`
* `pruneExpiredTokens()` — `src/server/auth/tokens.ts`
* `prunePendingRegistrations()` — `src/server/services/super-admin-service.ts`,
  for Super Admin registrations that were abandoned before the code was
  verified, or verified and then left uncompleted.

## Checklist for the first deploy

1. Set `DATABASE_URL` in the Vercel project.
2. Confirm `DEMO_SEED_PASSWORD` is **not** set.
3. Run `npx prisma migrate resolve --applied 0_init` once against the
   target database if it has the Laravel schema but no `_prisma_migrations`
   table.
4. Run `npm run db:migrate`.
5. Run `npm run db:seed` (safe and idempotent).
6. Deploy.
7. Sign in and confirm the session survives a page refresh — that is the
   one thing a misconfigured cookie breaks.
