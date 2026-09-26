# Database

The Node application uses **the same PostgreSQL database the Laravel
application used**. No data was copied, exported, re-keyed or migrated
between systems, and no table was renamed.

## Mapping strategy

`prisma/schema.prisma` carries an explicit `@@map` on every model and a
`@map` on every column, so Prisma's camelCase API sits on top of Laravel's
snake_case tables without touching them.

| Laravel / Eloquent              | Prisma                                       |
| ------------------------------- | -------------------------------------------- |
| `users` table, snake_case cols  | `model User` + `@@map("users")` + `@map(...)` |
| `$table->id()`                  | `BigInt @id @default(autoincrement())`        |
| `belongsTo`                     | scalar FK field + relation field              |
| `hasMany`                       | list relation                                 |
| `hasOne`                        | list relation, narrowed in the service        |
| `restrictOnDelete()`            | `onDelete: Restrict`                          |
| `cascadeOnDelete()`             | `onDelete: Cascade`                           |
| `nullOnDelete()`                | `onDelete: SetNull`                           |
| `$table->enum(...)`             | `String @db.VarChar(255)` — see below         |
| `timestamps()`                  | `createdAt` / `updatedAt` with `@db.Timestamp(0)` |
| spatie pivot tables             | modelled verbatim, `model_type` kept as text  |

### Enums are not Prisma enums

Laravel's `$table->enum()` on PostgreSQL produces a `varchar(255)` plus a
`CHECK` constraint. This database contains **no native enum types at all**
(verified against `pg_type`). Declaring Prisma enums would have made Prisma
want to `CREATE TYPE` and rewrite five live columns — a destructive change
for no benefit.

So the five status columns stay `String`, the CHECK constraints remain the
authority in the database, and the allowed values are mirrored as
TypeScript unions and Zod enums in `src/types/domain.ts`. Invalid values
are rejected before a query is built.

### One-to-one that is not unique

Eloquent declared `User hasOne Student`, but `students.user_id` carries no
unique index. Modelling it as a Prisma one-to-one would have required
adding one. It is a list relation instead, narrowed with `findFirst` in the
service — which is exactly what Eloquent's `hasOne` does at runtime.

### Constraint and index names

FK constraints keep Laravel's `*_foreign` names and unique indexes keep
`*_unique`, via `map:` in the schema. Without this Prisma would drop and
recreate all 24 foreign keys and rename ten indexes on the first migration.

Every FK is also pinned to `onUpdate: NoAction`, matching what Laravel
created; Prisma's default is `Cascade`.

## Verifying zero drift

```bash
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel  prisma/schema.prisma \
  --script
```

This prints the SQL needed to make the live database match the schema. It
should print nothing. Run it after any schema edit — it is the check that
caught the enum, timestamp-precision, `json` vs `jsonb`, FK-name and
FK-action mismatches during the migration.

## Legacy Laravel tables

`sessions`, `migrations`, `cache`, `cache_locks`, `jobs`, `job_batches` and
`failed_jobs` are still present and are **modelled in the schema** as
`Legacy*` models. That is intentional: if they were left out, Prisma would
propose `DROP TABLE` on all seven at the next migration.

Two of them are still in use:

- `cache` — reused as the login throttle store (see `authentication.md`).
- `migrations` — Laravel's ledger, kept for provenance.

The rest are inert. Dropping them is a deliberate, separate decision; see
`migration.md`.

## Migrations

```
prisma/migrations/
  0_init/                                    baseline — the schema as it
                                             already existed; marked applied,
                                             never executed
  20260925000001_add_username_and_auth_sessions/
  20260926000000_account_status_and_verification_tokens/
  20260926010000_google_identity/
  20260926020000_pending_admin_registrations/
```

Every delta is purely additive:

```sql
ALTER TABLE "users" ADD COLUMN "username" VARCHAR(255);
CREATE UNIQUE INDEX "users_username_unique" ON "users"("username");
CREATE TABLE "auth_sessions" (...);
CREATE TABLE "email_verification_tokens" (...);
CREATE TABLE "password_reset_requests" (...);
CREATE TABLE "pending_admin_registrations" (...);
```

No `DROP`, no `ALTER COLUMN`, no data movement.

### `pending_admin_registrations`

Super Admin registrations that have been filled in but not yet verified. It
exists so that no `users` row is created before the institutional address is
proven: the setup form writes here, the emailed code is checked against here,
and only a correct code turns the row into an account — inside one transaction
that deletes the row as it goes.

It holds a bcrypt password hash, a bcrypt hash of the six-digit code (bcrypt
rather than SHA-256 because the code has too little entropy for a fast digest
to protect), the SHA-256 of the browser's opaque setup-cookie handle, and the
attempt and resend counters. It grants nothing: a row here cannot sign in,
holds no session and has no role.

Unique on `email` and on `handle_hash`, so two requests cannot both insert a
registration for one address and one cookie can never resolve to two rows.
Indexed on `verification_expires_at` for the scheduled prune.

### Baselining a fresh environment

Against a database that already has the Laravel schema but no
`_prisma_migrations` table:

```bash
npx prisma migrate resolve --applied 0_init
npx prisma migrate deploy
```
