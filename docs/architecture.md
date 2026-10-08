# Architecture

TDMS runs entirely on Node.js and TypeScript: a React single-page app built
with Vite, and a Fastify REST API in front of Prisma and PostgreSQL. There is
no PHP, no Laravel and no Next.js anywhere in the application.

```
React + Vite (client/)
        ↓  fetch /api/v1/…
Node.js + Fastify (server/)
        ↓
Service layer (server/src/services)
        ↓
Prisma
        ↓
PostgreSQL (Neon)
```

## Stack

| Concern         | Before (Laravel)                     | Now                                         |
| --------------- | ------------------------------------ | ------------------------------------------- |
| Runtime         | PHP 8.3                              | Node.js 22+                                 |
| HTTP server     | Laravel 13 + Livewire Volt           | Fastify 5                                   |
| Frontend        | Blade + Alpine.js                    | React 19 + React Router, built by Vite      |
| Language        | PHP                                  | TypeScript (strict)                         |
| ORM             | Eloquent                             | Prisma 6                                    |
| Database        | PostgreSQL (Neon)                    | PostgreSQL (Neon) — the same one            |
| Auth            | Laravel session guard                | Server sessions + HTTP-only cookie          |
| Authorization   | Gates + Policies + spatie/permission | Policy functions over the same spatie tables |
| Validation      | Laravel validator                    | Zod                                         |
| Styling         | Tailwind 3 + custom CSS              | Tailwind 3 + the same custom CSS            |
| Tests           | Pest                                 | Vitest (+ end-to-end suites in scripts/e2e) |

## Directory layout

```
client/                    The React app
  index.html               Entry document (title, fonts, favicon)
  vite.config.ts           Dev server (:3000, proxies /api), build, aliases
  tailwind.config.ts       The TDMS design system
  public/                  Branding: logos, campus and programme photos
  src/
    App.tsx                Every route
    main.tsx               Mounts the app
    layouts/AppLayout.tsx  The signed-in shell (sidebar, header)
    pages/                 One component per route; auth/, app/, system/
    components/            Screens and UI pieces, unchanged from before
    lib/                   page-data (loaders), navigation, link, api-client
    styles/globals.css     Tailwind + the original auth stylesheet

server/                    The API
  src/
    server.ts              Entry point: listen on PORT
    app.ts                 Fastify instance: cookies, raw bodies, security
                           headers, the request guard, routes, static files
    routes/
      api.routes.ts        Every REST endpoint: METHOD /api/v1/… -> controller
      pages.routes.ts      Every page loader: GET /api/v1/pages/…
      bridge.ts            Fastify <-> Fetch Request/Response
      page-bridge.ts       Runs a page loader; maps redirect/401/403/404/503
    controllers/           REST handlers (Fetch Request -> Response)
      pages/               Page loaders: what each screen needs, decided here
    services/              Business logic
    auth/                  Sessions, passwords, RBAC, rate limiting, OAuth
    schemas/               Zod schemas
    middleware/            request-guard: CSRF and anonymous-API refusal
    plugins/               request-context: per-request cookies and memo
    lib/                   Prisma client, HTTP envelope, storage, encoding
    mail/                  Mail transports and messages
    test/                  fake-prisma for offline tests

shared/                    Pure TypeScript used by both sides
  lib/                     Policies, password policy, teaching rules, labels,
                           institution time, audit vocabularies, greeting
  types/                   Domain vocabularies, AuthUser, navigation

prisma/                    schema.prisma, migrations, seed.ts
scripts/                   admin:create, db:fresh, build-server, e2e suites
```

## Where the rules live

Business logic sits in `server/src/services/`, never in a React component.
Each service is a plain module of exported functions that take primitives
and return plain data, so it can be called from a controller, a page loader
or a test without ceremony.

- **Page loaders** (`server/src/controllers/pages`) are the server half of
  each screen. A loader resolves the session, runs the page's policy and
  returns exactly the props the screen renders. It can also redirect (not
  signed in, temporary password) or refuse (403/404). The React page only
  draws what it is given. Dates, Maps, Sets and BigInts survive the trip
  (`server/src/lib/page-encoding.ts` / `client/src/lib/page-data.tsx`).
- **Controllers** are thin: authenticate, authorize, validate, call a
  service, wrap the result. They take a standard Fetch `Request` and return
  a `Response`, so tests call them directly.
- **Shared code** is the only code both sides import. Screens may import the
  *types* of server modules (erased at build time); the Vite build has no
  alias for `server/`, so importing server *code* into the browser fails the
  build.

## Request lifecycle

Opening a page:

```
Browser: /students
  → React Router                  StudentsPage
  → GET /api/v1/pages/students    (with the session cookie)
  → request-guard                 cross-site write? (pages are GET: passes)
  → page loader                   requireUser() + authorizePage(policy(user))
  → service                       business rule + Prisma query
  → { success, data }             -> <StudentsScreen {...data} />
                                  or { redirect } / 401 -> /login?redirect=…
                                  or 403 / 404 -> forbidden / not-found screen
```

A mutation:

```
Screen
  → fetch /api/v1/…               (lib/api-client.ts)
  → request-guard                 cross-site write -> 403; no cookie -> 401
  → withErrorHandling             catches everything, redacts the unexpected
  → requireApiUser()              session -> principal
  → authorize(policy(user))       403 if not allowed
  → Zod parse                     422 with field errors if invalid
  → service                       business rule, transaction where needed
  → ok(data)                      { success: true, data }
  → router.refresh()              the screen's loaders run again
```

See `authentication.md` for why the authoritative check is in the data
layer rather than in the request guard.
