# Laravel → Node.js migration

What was done, what changed, and what is deliberately still open.

## Component map

| Laravel                                   | Node.js replacement                                         |
| ----------------------------------------- | ----------------------------------------------------------- |
| `routes/web.php`, `routes/auth.php`       | Next.js file-system routes under `src/app/`                  |
| Livewire Volt component class             | server component (`page.tsx`) + client component (`screens/`) |
| Livewire component method                 | `POST`/`PUT`/`PATCH`/`DELETE` route handler                  |
| Blade template                            | React JSX, same classes and copy                             |
| Blade component (`x-card`, `x-badge`, …)  | `src/components/ui.tsx`                                      |
| Alpine.js (`x-data`, `x-show`)            | React `useState` / `useEffect`                               |
| Eloquent model                            | Prisma model + a service module                              |
| Model method (`Application::approve()`)   | service function, transactional                              |
| `app/Policies/*.php`                      | `src/server/auth/policies.ts`                                |
| `Gate::before` super-admin grant          | `isSuperAdmin()` short-circuit in `can()` / `inRoles()`      |
| `$this->validate([...])`                  | Zod schema in `src/server/validation/schemas.ts`             |
| `App\Livewire\Forms\LoginForm`            | `src/server/services/auth-service.ts`                        |
| Laravel session guard                     | `src/server/auth/session.ts`                                 |
| `EnsureAccountIsActive` middleware        | the active check inside `getCurrentUser()`                   |
| `EnsureSuperAdminNotBootstrapped`         | `isBootstrapAllowed()`, re-checked in the transaction        |
| `SuperAdminBootstrapService`              | `src/server/services/super-admin-service.ts`                 |
| `AuditLog::record()`                      | `src/server/services/audit-log.ts`                           |
| `RateLimiter` (cache store)               | `src/server/auth/rate-limit.ts`, same `cache` table          |
| `DatabaseSeeder`                          | `prisma/seed.ts`                                             |
| `DevSeeder`                               | `prisma/seed-demo.ts`                                        |
| `database/migrations/*`                   | `prisma/migrations/0_init` (baseline)                        |
| Pest tests                                | Vitest (`src/**/*.test.ts`)                                  |
| `lang/en/auth.php`                        | message constants in `auth-service.ts`                       |

## Bugs found and fixed

These were defects in the Laravel code, not migration artefacts. Each is
called out because "preserve behaviour" should not mean preserving a bug.

1. **Username login was impossible.** Covered in detail in
   `authentication.md`. The fix required a new `users.username` column.

2. **`DevSeeder` could not be re-run.** It used
   `User::factory()->create()`, so a second run hit the unique index on
   `users.email` and aborted — meaning a demo account with a wrong password
   could never be repaired by re-seeding. `prisma/seed-demo.ts` upserts.

3. **Subject names never rendered on the dashboard.** The Blade read
   `$cs->subject->name`, but `Subject` has no `name` column — only
   `title` — so the cell always fell back to an em-dash. Now reads `title`.

4. **Student search was case-sensitive.** PostgreSQL `LIKE` is
   case-sensitive, so searching "santos" missed "Santos". Now uses
   `mode: 'insensitive'`.

5. **`Student::nextStudentNumber()` was not actually safe under
   concurrency.** It took `lockForUpdate()` on a `COUNT`, which locks no
   rows when the year has no students yet, so two simultaneous callers
   could compute the same number. The Node version wraps the whole insert
   in a transaction and retries on the unique violation, so a collision is
   resolved rather than merely made less likely.

## Deliberate behaviour changes

Each of these is a change, made knowingly, with the reason:

- **Login is throttled the same way but stored differently** — in the
  `cache` table rather than in process memory, because serverless
  functions share no memory.
- **Deactivating an account now destroys its sessions immediately.**
  Laravel's middleware ended access on the victim's *next* request; doing
  it at once is strictly better and costs one query.
- **An administrative password reset also destroys sessions.** Otherwise a
  compromised session survives the reset meant to end it.
- **Dashboard "System Health" no longer reports disk usage.** It read
  `disk_free_space(storage_path())`, which on Vercel describes an
  ephemeral `/tmp` and says nothing about the application. The database
  probe — the part that matters — is kept; storage reports as unavailable.
- **`/forgot-password` explains the real recovery path** instead of
  pretending to send mail. See "Remaining work".

## Deliberate omissions

- **Email verification flow.** `User` never implemented `MustVerifyEmail`,
  so Laravel's `verified` middleware was a no-op for every account and the
  verify-email screens were unreachable in practice. Not rebuilt.
- **Self-service account deletion.** `deleteOwnAccount()` exists in
  `profile-service.ts` and is tested, but is not exposed in the UI. In a
  system of record for student enrolment, letting a user irreversibly
  delete their own account from a settings page is a footgun; an
  administrator deactivating them is the appropriate action, and that is
  wired up.
- **`confirm-password` interstitial.** Nothing in TDMS was gated behind
  `password.confirm`, so the screen guarded nothing.

## Remaining work

1. **Password reset email.** `MAIL_MAILER` was `log` under Laravel, so
   reset mail never actually went anywhere. A Node mail provider (Resend,
   SES, Postmark) needs wiring before `/forgot-password` can do more than
   direct the user to an administrator. The `password_reset_tokens` table
   is preserved and modelled, ready for it.
2. **File storage.** The schema has `student_credentials.file_path`, but
   the Laravel application never implemented upload, download or preview —
   there is no `Storage::` call anywhere in the removed code and no
   filesystem disk beyond the default. Verification works on the record,
   not on a document. Wiring object storage (Vercel Blob or Supabase
   Storage) is net-new work, not a migration task.
3. **Drop the dead Laravel tables.** `jobs`, `job_batches`, `failed_jobs`,
   `cache_locks`, `sessions` and `migrations` are inert. They are modelled
   so Prisma will not drop them behind your back; removing them is a
   deliberate decision for you to make. `cache` must stay — it backs login
   throttling.
4. **Rotate the demo passwords.** See the security note below.

## Security note: the demo accounts

`DATABASE_URL` points at the same Neon database the Vercel deployment
uses. `npm run db:seed:demo` therefore writes seven accounts with a
well-known password — including `super_admin` and `admin` — into what is
effectively production.

The seed refuses to run when `NODE_ENV=production`, but that guard protects
the *process*, not the *database*: running it locally against a production
`DATABASE_URL` still writes those rows.

Two options, in order of preference:

1. Point local development at a separate Neon branch, and delete the
   `@tdms.test` accounts from the production database.
2. Keep them, but rotate the password immediately after any demo, and
   never leave `super_admin@tdms.test` reachable from the public URL.

## Verification performed

- `npx prisma migrate diff` reports **no drift** between schema and
  database beyond the intended additive delta.
- `npm run build` — clean; 13 pages, 25 API routes, middleware.
- `npm run typecheck` — clean (TypeScript strict).
- `npm test` — 41 unit tests pass.
- End-to-end against a live server and the real database: **96 checks**
  covering login by username and by email, case and whitespace handling,
  wrong password, unknown account, empty fields, session persistence
  across refresh, logout and re-login, protected-route redirects, per-role
  authorization for all seven roles, cookie flags, error redaction, full
  CRUD on programs / curricula / subjects / students, the application
  approval workflow, and the enrolment credential gate. All passed; the
  temporary rows created by the CRUD run were deleted afterwards.
