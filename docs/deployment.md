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
| `DEMO_SEED_PASSWORD`       | no       | Only read by `db:seed:demo`. **Never set on Vercel.**       |

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

## Scheduled work

Laravel's queue and scheduler tables exist but were never used — there are
no jobs, no commands beyond the framework's own, and nothing in
`routes/console.php`. Nothing was therefore dropped.

One new piece of housekeeping does exist: expired rows in `auth_sessions`.
Expired sessions are already rejected on sight and deleted when
encountered, so this is hygiene rather than correctness. To reclaim the
space on a schedule, call `pruneExpiredSessions()` from
`src/server/auth/session.ts` on a Vercel Cron.

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
