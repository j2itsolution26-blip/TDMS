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
| `DATABASE_URL`             | yes      | PostgreSQL connection string, pooled                        |
| `NODE_ENV`                 | yes      | `production` on Vercel; drives the `secure` cookie flag     |
| `SESSION_LIFETIME_MINUTES` | no       | Default 120                                                 |
| `BCRYPT_ROUNDS`            | no       | Default 12 — keep at 12 to match the existing hashes        |
| `DEMO_SEED_PASSWORD`       | no       | Only read by `db:seed:demo`. **Never set on Vercel.**       |

Nothing secret is exposed to the browser: no variable is prefixed
`NEXT_PUBLIC_`, and `DATABASE_URL` is only ever read inside `server-only`
modules.

### Connection pooling

Serverless functions each open their own connection. Use the **pooled**
Neon host (the `-pooler` one, already in `DATABASE_URL`) or the database
will run out of connections under any real load.

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
