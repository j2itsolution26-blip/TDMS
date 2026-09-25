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

For a local database with sign-in-able accounts:

```bash
npm run db:seed:demo          # never run this against production
```

That creates one account per role. Sign in with either the username or the
email address:

| Username      | Email                     | Role          |
| ------------- | ------------------------- | ------------- |
| `superadmin`  | `superadmin@tdms.test`    | Super Admin   |
| `admin`       | `admin@tdms.test`         | Admin         |
| `director`    | `director@tdms.test`      | Director      |
| `coordinator` | `coordinator@tdms.test`   | Coordinator   |
| `secretary`   | `secretary@tdms.test`     | Secretary     |
| `teacher`     | `teacher@tdms.test`       | Teacher       |
| `student`     | `student@tdms.test`       | Student       |

The password comes from `DEMO_SEED_PASSWORD` (default `Password123!`).

If the system has no Super Admin at all, `/login` offers **Create Super
Admin**, a one-time bootstrap that disappears the moment one exists.

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
| `npm run db:seed:demo` | Demo accounts — development only            |

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
