-- Pending Super Admin registrations.
--
-- Purely additive: one new table. Nothing is dropped, renamed or rewritten.
--
-- WHY IT EXISTS
--
-- The web bootstrap used to create a real `users` row immediately and leave
-- it PENDING until an emailed link was opened. That meant an unverified
-- address could occupy the one Super Admin slot, and the account existed
-- before anybody had proven they hold the mailbox.
--
-- Registration details now land here instead. Only a correct verification
-- code turns this row into a `users` row, in a single transaction that
-- deletes the pending row as it goes.

-- CreateTable
CREATE TABLE "pending_admin_registrations" (
    "id" BIGSERIAL NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    -- A finished bcrypt hash. The plaintext password is never stored here.
    "password_hash" VARCHAR(255) NOT NULL,
    -- bcrypt, not SHA-256: a six-digit code has too little entropy for a
    -- fast digest to survive a database dump. Emptied on successful use.
    "verification_code_hash" VARCHAR(255) NOT NULL,
    "verification_expires_at" TIMESTAMP(3) NOT NULL,
    "verification_attempts" INTEGER NOT NULL DEFAULT 0,
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- SHA-256 of the opaque handle held in the browser's HttpOnly cookie.
    "handle_hash" VARCHAR(64) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_admin_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One pending registration per address, enforced by the database so two
-- concurrent requests cannot both insert one.
CREATE UNIQUE INDEX "pending_admin_registrations_email_unique" ON "pending_admin_registrations"("email");

-- CreateIndex
-- The handle is looked up on every verification attempt, and must be unique
-- so one cookie can never resolve to two rows.
CREATE UNIQUE INDEX "pending_admin_registrations_handle_hash_unique" ON "pending_admin_registrations"("handle_hash");

-- CreateIndex
-- Supports the scheduled prune of expired rows.
CREATE INDEX "pending_admin_registrations_verification_expires_at_idx" ON "pending_admin_registrations"("verification_expires_at");
