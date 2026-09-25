# Architecture

TDMS runs entirely on Node.js and TypeScript. There is no PHP, no Laravel,
no Composer and no Blade anywhere in the deployed application.

## Stack

| Concern         | Before (Laravel)                  | Now (Node)                        |
| --------------- | --------------------------------- | --------------------------------- |
| Runtime         | PHP 8.3                           | Node.js 20+                       |
| Framework       | Laravel 13 + Livewire Volt        | Next.js 15 (App Router)           |
| Language        | PHP                               | TypeScript (strict)               |
| Views           | Blade + Alpine.js                 | React 19 server & client components |
| ORM             | Eloquent                          | Prisma 6                          |
| Database        | PostgreSQL (Neon)                 | PostgreSQL (Neon) — the same one  |
| Auth            | Laravel session guard             | Server sessions + HTTP-only cookie |
| Authorization   | Gates + Policies + spatie/permission | Policy functions over the same spatie tables |
| Validation      | Laravel validator                 | Zod                               |
| Styling         | Tailwind 3 + custom CSS           | Tailwind 3 + the same custom CSS  |
| Build           | Vite                              | Next.js / Turbopack               |
| Tests           | Pest                              | Vitest                            |

## Directory layout

```
prisma/
  schema.prisma          Mapped 1:1 onto the existing tables
  migrations/            0_init (baseline) + the additive delta
  seed.ts                Roles, permissions, credential requirements
  seed-demo.ts           Demo accounts (never runs in production)
public/                  Branding: logos, campus and programme photos
src/
  app/
    (app)/               Signed-in area; its layout enforces auth
    api/                 Route handlers — the JSON API
    login/               Branded sign-in screen
    create-super-admin/  One-time bootstrap
    globals.css          Tailwind + the original auth stylesheet
  components/
    screens/             One client component per ported page
    ui.tsx               Card, Badge, StatCard, Alert, Pagination, …
  lib/                   Prisma client, HTTP envelope, dates, serialisation
  server/
    auth/                Sessions, passwords, RBAC, policies, rate limiting
    services/            Business logic ported from models and Volt classes
    validation/          Zod schemas
    api-handler.ts       Centralised error handling
  types/domain.ts        Status vocabularies and the AuthUser shape
  middleware.ts          Coarse edge gate (see authentication.md)
```

## Where the rules live

Business logic sits in `src/server/services/`, never in a React component.
Each service is a plain module of exported functions that take primitives
and return plain data, so it can be called from a route handler, a server
component or a test without ceremony.

The boundary is deliberate:

- **Server components** read data directly through a service. No HTTP hop,
  no loading spinner, no client-side fetch for the initial render.
- **Client components** exist only where there is genuine interaction —
  a modal form, the sidebar toggle, the password visibility button — and
  they talk to the API through `src/lib/api-client.ts`.
- **Route handlers** are thin: authenticate, authorize, validate, call a
  service, wrap the result. They contain no rules of their own.

## Request lifecycle

```
Request
  → middleware.ts            cookie present? (cheap, Edge, optimistic only)
  → (app)/layout.tsx         requireUser(): resolve session, load roles
  → page.tsx                 authorizePage(policy(user))
  → service                  business rule + Prisma query
  → React server render      HTML
```

For a mutation:

```
Client component
  → fetch /api/…
  → withErrorHandling        catches everything, redacts the unexpected
  → requireApiUser()         session → principal
  → authorize(policy(user))  403 if not allowed
  → Zod parse                422 with field errors if invalid
  → service                  business rule, transaction where needed
  → ok(data)                 { success: true, data }
```

See `authentication.md` for why the authoritative check is in the data
layer rather than in middleware.
