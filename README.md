# TDMS — TVET Diploma Management System

Diploma programme, student, credential and enrolment management for the
Asian College of Science and Technology.

Built with **Next.js 15**, **TypeScript**, **React 19**, **Prisma 6** and
**PostgreSQL**. No PHP.

## Quick start

```bash
npm install
cp .env.example .env          # then set DATABASE_URL
npm run db:migrate            # apply schema changes
npm run db:seed               # roles, permissions, credential requirements
npm run dev                   # http://localhost:3000
```

There are **no demo accounts**. A fresh installation has roles and
permissions but no users, so create the first administrator:

```bash
npm run admin:create -- --name "Your Name" --email you@asiancollege.edu.ph
```

…or open `/login` and use **Create Super Admin**, which emails a verification
link (this needs a mail provider — see [accounts.md](docs/accounts.md)).

Sign-in is **Continue with Google** against a real `@asiancollege.edu.ph`
Google account, with the credential form kept beneath it for staff who have
not linked Google. Every account must be on the institutional domain, must
have a verified address, and must be `ACTIVE` before it can sign in — a
first-time Google sign-in creates a `PENDING` account with **no role**, for an
administrator to approve. Administrators invite
colleagues from the Staff screen; nobody is ever issued a generated password.

To wipe accounts and academic records while keeping roles and permissions:

```bash
CONFIRM_DB_FRESH=<database-name> npm run db:fresh
```

It refuses to run in production, and refuses to run at all unless you name
the target database out loud.

## Scripts

| Command                | Does                                        |
| ---------------------- | ------------------------------------------- |
| `npm run dev`          | Development server                          |
| `npm run build`        | `prisma generate` + production build        |
| `npm start`            | Serve the production build                  |
| `npm test`             | Unit tests (Vitest)                         |
| `npm run typecheck`    | `tsc --noEmit`                              |
| `npm run db:migrate`   | Apply migrations                            |
| `npm run db:seed`      | System configuration — safe, idempotent     |
| `npm run db:fresh`     | Wipe accounts + records, keep configuration |
| `npm run admin:create` | Provision the first administrator           |
| `npm run test:accounts`| Account lifecycle end-to-end (local)        |

## Roles

Seven roles, unchanged from the original system: Super Admin, Admin,
Director, Coordinator, Secretary, Teacher, Student. Permissions are stored
in the `roles` / `permissions` / `model_has_roles` tables and enforced
server-side by the policy functions in `src/server/auth/policies.ts`.

A Super Admin passes every permission check, with one exception: nobody,
including a Super Admin, can deactivate their own account.

## Documentation

| Document                                     | Covers                                    |
| -------------------------------------------- | ----------------------------------------- |
| [architecture.md](docs/architecture.md)       | Stack, layout, request lifecycle          |
| [accounts.md](docs/accounts.md)               | Institutional email, states, invitations  |
| [google-auth.md](docs/google-auth.md)         | Google sign-in, Google Cloud setup        |
| [database.md](docs/database.md)               | Prisma schema, mapping, migrations        |
| [authentication.md](docs/authentication.md)   | Sign-in, sessions, cookies, RBAC          |
| [api.md](docs/api.md)                         | Endpoints and the Livewire → REST map     |
| [deployment.md](docs/deployment.md)           | Vercel, env vars, first deploy            |
| [migration.md](docs/migration.md)             | What changed moving off Laravel, and why  |

## Notes

- The application reuses the **existing PostgreSQL database**. No table was
  renamed and no data was moved; see [database.md](docs/database.md).
- Existing bcrypt passwords written by PHP work unchanged — no account
  needed a reset.
- Before deploying, read the security note in
  [migration.md](docs/migration.md) about the demo accounts.
