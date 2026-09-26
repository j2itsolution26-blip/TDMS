# Deployment

The application is a standard Next.js app.

## vercel.json

The Laravel-era `vercel.json` (PHP runtime, hand-written routes,
`outputDirectory: public`) was deleted. A minimal one replaces it:

```json
{
  "framework": "nextjs",
  "outputDirectory": null,
  "regions": ["sin1"]
}
```

The first two lines exist to override **stale dashboard Project Settings left over
from the PHP deployment**, which survive a repository change because they
live in the Vercel project, not in git. With the old settings the build
compiled fine and then failed with:

```
Error: No Output Directory named "dist" found after the Build completed.
```

That is Vercel running the *static* build path — it had the Framework
Preset on "Other" and an Output Directory override of `dist`, so after
running the build it went looking for a folder of static files. A Next.js
build produces `.next` and a set of functions instead, which Vercel only
knows how to deploy once the framework preset says `nextjs`.

`vercel.json` takes precedence over the dashboard, so committing these two
keys fixes it for every environment at once and keeps the setting in
version control. Note that `"framework": null` would mean "Other" — the
slug `"nextjs"` is what is wanted. Setting `outputDirectory` to `null`
clears the dashboard override and returns it to the framework default.

You may also clear both in the dashboard (Settings → Build & Deployment);
the file makes that unnecessary.

### Function region

`"regions": ["sin1"]` pins the serverless functions to Singapore
(`ap-southeast-1`) — the same AWS region as the Neon database.

This matters more than it looks. Vercel functions default to `iad1`
(Washington, D.C.), so without this every Prisma query would cross the
Pacific at roughly 230 ms per round trip. The dashboard alone issues about
ten queries, which is seconds of latency per page load for work the
database answers in single-digit milliseconds. Vercel's own guidance is to
run functions in the same region as the database.

It is a single region, so it is valid on every plan including Hobby
(multi-region requires Pro or Enterprise). Static assets are unaffected —
they are served from all 126 PoPs regardless — and the Edge middleware
stays globally distributed, which is fine because it only reads a cookie.

If the database ever moves, change this to match it: the region codes are
listed at https://vercel.com/docs/regions.

## Commands

```bash
npm install          # install
npm run dev          # local development, http://localhost:3000
npm run build        # prisma generate + next build
npm start            # serve the production build
npm test             # unit tests
npm run typecheck    # tsc --noEmit
```

Database:

```bash
npm run db:migrate       # prisma migrate deploy
npm run db:seed          # roles, permissions, credential requirements
npm run db:seed:demo     # demo accounts — development only
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
| `BCRYPT_ROUNDS`            | no       | Default 12 — keep at 12 to match the existing hashes        |
| `GOOGLE_DOMAIN_RESTRICTION_ENABLED` | no | Default **false** (open). Set `true` for launch            |
| `GOOGLE_ALLOWED_DOMAIN`    | no       | Enforced domain when the above is true                      |
| `DEV_AUTO_ACTIVATE_GOOGLE_USERS` | no | Default false. Development only; grants no role             |
| `APP_URL`                  | yes*     | Absolute base for links in email. *Once email is enabled    |
| `MAIL_HOST`                | yes*     | *SMTP host. Either this or `RESEND_API_KEY` is required     |
| `MAIL_PORT`                | yes*     | *With `MAIL_HOST`. 587 for STARTTLS, 465 for implicit TLS   |
| `MAIL_USERNAME`            | no       | Omit only for a relay that needs no authentication          |
| `MAIL_PASSWORD`            | no       | With `MAIL_USERNAME`. Never committed                       |
| `MAIL_ENCRYPTION`          | no       | Derived from the port when unset                            |
| `RESEND_API_KEY`           | yes*     | *Alternative to SMTP, used when `MAIL_HOST` is unset        |
| `MAIL_FROM_ADDRESS`        | yes*     | *Required once mail is configured; no default sender        |
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

Nothing secret is exposed to the browser: no variable is prefixed
`NEXT_PUBLIC_`, and `DATABASE_URL` is only ever read inside `server-only`
modules.

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
curl -s https://<deployment>/api/health | jq .databaseUrlSource
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

`GET /api/health` is unauthenticated and reports whether the database is
reachable, the Prisma error code if it is not, and whether each required
environment variable is set — booleans and codes only, never a value:

```bash
curl -s https://<deployment>/api/health | jq
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
mid-session deactivation, and `/api/health`. It deactivates and restores
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

Invitations, email verification, password resets and the Super Admin setup
code all need real mail. There are two transports, chosen from the
environment, and **no development fallback**:

| Transport | Chosen when            | Notes                                        |
| --------- | ---------------------- | -------------------------------------------- |
| `smtp`    | `MAIL_HOST` is set     | Any SMTP server. STARTTLS is required, not merely offered |
| `resend`  | `RESEND_API_KEY` is set and `MAIL_HOST` is not | HTTP API, no outbound TCP needed |
| `none`    | neither is set         | Sending **fails**. Nothing is queued or logged |

`MAIL_FROM_ADDRESS` is required alongside either transport; without a sender
address mail counts as unconfigured.

There used to be a third, `log`, which wrote the message — verification link
included — to the server log and reported success in development. It is gone.
It made a flow look like it worked while nothing was delivered, and it put a
live credential in the logs. Today, when mail is unconfigured:

* `sendMail` reports failure, and the log records only that no provider is
  configured — never the recipient, the body, or a code;
* flows that depend on delivery refuse to proceed. In particular **no Super
  Admin account is created**: the setup screen shows an administrator-facing
  configuration error naming the variables to set, and stops.

`APP_URL` is configuration and is never derived from a request header. `Host`
is attacker-controlled, and a poisoned value would send verification links to
somebody else's domain.

### Sender domain

Whichever transport you use, the address in `MAIL_FROM_ADDRESS` must be one
the provider is authorised to send for, with SPF and DKIM published for that
domain. Institutional mail is filtered hard; a mismatched sender is the usual
reason a code "never arrives" when the application reports it as delivered.

## A migration that exists is not a migration that ran

The registration flow once failed with a bare "Something went wrong" because
`prisma/migrations/..._pending_admin_registrations` had been written and
committed but never applied. Prisma raised P2021 ("table does not exist"), the
error wrapper had no specific handling for it, and the generic message hid the
one fact that would have explained it.

Two things changed as a result:

1. **`/api/health` is not enough on its own** — it reports that the database is
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
