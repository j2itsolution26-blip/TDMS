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
| `DevSeeder`                               | removed - no demo accounts exist (see accounts.md)           |
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

## Fresh start, and institutional accounts

The migration originally carried the Laravel demo accounts across so the new
system could be exercised. That was scaffolding, and it is now gone.

What was decided, and why:

- **No demo accounts, and no demo seed.** `prisma/seed-demo.ts` and
  `db:seed:demo` are deleted rather than merely unused. A seed that creates
  accounts with a known password is a liability the moment any environment
  shares a database with production - which this one does.
- **No generated passwords anywhere.** Inviting staff used to display a
  one-time password on screen, which meant the administrator knew it. An
  invitation now creates an account whose password column holds a random value
  discarded on the line that hashes it, and the invitee sets their own through
  a verification link.
- **Institutional domain only.** Every address must be on
  `@asiancollege.edu.ph`, checked server-side against an exact match, not a
  suffix.
- **Verification is required, not implied.** Being on the right domain is not
  proof of holding the mailbox. `status` and `emailVerifiedAt` are separate
  conditions and both must hold to sign in.
- **`prisma/seed.ts` creates no users at all** - roles, permissions and the
  credential-requirement checklist only.

The database this was developed against held no academic records at all (zero
students, programmes, subjects, curricula, applications, enrolments) and ten
accounts, every one of them on `tdms.test` or `gmail.com`. None can sign in
under the domain rule, which is the intended outcome of starting fresh.

### Google Workspace sign-in - considered, not built

"Continue with Google" would suit an institution already on Workspace and
would remove passwords from the system entirely. It is deliberately not
implemented, for one reason: OAuth *is* authentication, and shipping an
authentication path never exercised against a real identity provider is worse
than not having it. It needs a Workspace project, a client id and secret and a
verified redirect URI before it can be tested at all.

The shape is already settled by what is here, if you want it: the identity
must come from Google's token response and never from a client-supplied email
field, `email_verified` must be true, and the `hd` claim must equal the
institutional domain exactly - the same rule as
`src/lib/institutional-email.ts` applied to a different input.

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
4. **Configure a mail provider.** Until `RESEND_API_KEY` is set, invitations
   and resets cannot be delivered; use `npm run admin:create` to provision
   the first administrator.

## Security note

The database used for development is the same instance the Vercel deployment
uses. That is the reason there is no demo seed and no generated password
anywhere in this codebase: anything created for convenience would be created
in production.

`npm run db:fresh` is the only destructive command, and it refuses to run
unless you name the target database explicitly.

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
