-- Super Admin-issued Admin accounts and their one-time access codes.
--
-- Purely additive: one new column and two new tables. Nothing is dropped,
-- renamed or rewritten, and no existing row changes meaning.
--
-- WHY IT EXISTS
--
-- An Admin account used to be created by invitation and then activated by
-- whoever happened to look at the Staff screen. That made "who is allowed to
-- administer this system" a decision taken by omission. It is now taken
-- explicitly by a Super Admin, who creates the account, sets a temporary
-- password, and issues a separate one-time code without which the password
-- alone does not get anybody in.
--
-- The three pieces below are what that needs, and nothing more:
--
--   users.must_change_password  a fact about the CREDENTIAL, not the account.
--                               `status` deliberately stays ACTIVE for a new
--                               Admin; overloading it to mean "has not
--                               finished setup" is what produced the old
--                               "Pending approval" confusion.
--
--   admin_access_codes          one row per issued code: bcrypt hash, expiry,
--                               single-use stamp, guess budget, and who
--                               issued it.
--
--   admin_login_challenges      one row per sign-in that has passed the
--                               password and not yet the code. It exists so
--                               that NO session is issued in between.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "admin_access_codes" (
    "id" BIGSERIAL NOT NULL,
    "admin_user_id" BIGINT NOT NULL,
    -- bcrypt, not SHA-256: six digits is under 20 bits of entropy, and a
    -- fast digest of that is reversible from a dump in under a second.
    "code_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    -- Single use. Stamped inside the transaction that creates the session,
    -- so two requests racing on one code cannot both succeed.
    "used_at" TIMESTAMP(3),
    -- Superseded by a newer code, or burnt by too many wrong guesses. A
    -- different fact from used_at, kept separate so the audit trail can say
    -- which of the two happened.
    "invalidated_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    -- Copied from configuration at issue time, so raising the limit later
    -- cannot revive a code that was already burnt.
    "max_attempts" INTEGER NOT NULL,
    "created_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_access_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Every verification looks up the live code for one admin.
CREATE INDEX "admin_access_codes_admin_user_id_idx" ON "admin_access_codes"("admin_user_id");

-- CreateIndex
-- Supports the scheduled prune of long-dead codes.
CREATE INDEX "admin_access_codes_expires_at_idx" ON "admin_access_codes"("expires_at");

-- AddForeignKey
-- Deleting the admin deletes their codes: a code for an account that no
-- longer exists must not linger.
ALTER TABLE "admin_access_codes" ADD CONSTRAINT "admin_access_codes_admin_user_id_fkey"
    FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Deleting the ISSUER only nulls the attribution; the record of what was
-- issued survives.
ALTER TABLE "admin_access_codes" ADD CONSTRAINT "admin_access_codes_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "admin_login_challenges" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    -- SHA-256 of the opaque handle in the browser's HttpOnly cookie. 32
    -- bytes of entropy, so a fast digest is the right choice here — there is
    -- nothing to brute force.
    "handle_hash" VARCHAR(64) NOT NULL,
    "remember" BOOLEAN NOT NULL DEFAULT false,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_login_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Unique so one cookie can never resolve to two half-finished sign-ins.
CREATE UNIQUE INDEX "admin_login_challenges_handle_hash_unique" ON "admin_login_challenges"("handle_hash");

-- CreateIndex
CREATE INDEX "admin_login_challenges_user_id_idx" ON "admin_login_challenges"("user_id");

-- CreateIndex
CREATE INDEX "admin_login_challenges_expires_at_idx" ON "admin_login_challenges"("expires_at");

-- AddForeignKey
ALTER TABLE "admin_login_challenges" ADD CONSTRAINT "admin_login_challenges_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
