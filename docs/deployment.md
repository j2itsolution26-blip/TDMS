# Deployment

The application is a standard Next.js app. Vercel detects it with no
configuration, which is why the Laravel-era `vercel.json` (PHP runtime and
hand-written routes) was deleted rather than rewritten.

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
