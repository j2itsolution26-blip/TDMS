# TDMS — TVET Diploma Management System

Asian College's TDMS, on Next.js + TypeScript + Prisma/PostgreSQL. This app is the in-progress
replacement for an earlier Laravel/Blade implementation (see `git log` on the `main` branch for
that history) — this branch (`migrate-to-nextjs`) no longer contains any Laravel/PHP code.

## Status

Real and working: login, session-based auth, RBAC, dashboard, Programs (full CRUD).
Not yet built: students, enrollment, applications, credentials, staff/account management,
attendance, grades, clearance, reports, notifications. See the migration report in the
project history for the detailed breakdown of what's real versus pending.

## Stack

- Next.js (App Router) + TypeScript (strict)
- Tailwind CSS
- Prisma + PostgreSQL (Neon)
- Server-side session auth (bcrypt, database-backed sessions) + centralized RBAC — no
  authorization logic lives only in the UI

## Getting started

```bash
npm install
npx prisma db push      # sync the schema to your database
npx prisma db seed      # roles/permissions + a bootstrap super_admin
npm run dev
```

Copy `.env.example` to `.env` and set `DATABASE_URL` (Postgres) and `SESSION_SECRET` first.

## Scripts

```bash
npm run dev      # start the dev server
npm run build    # production build
npm run start    # run a production build
npm run lint     # eslint
```
