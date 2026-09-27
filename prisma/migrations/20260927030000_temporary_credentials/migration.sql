-- Temporary credentials: a revealable copy of an Admin's TEMPORARY password.
--
-- Purely additive: one new table.
--
-- The Super Admin needs to show an Admin's temporary password again until the
-- Admin replaces it. The login check cannot help — users.password is a bcrypt
-- hash and cannot be reversed — so the temporary password is also kept here,
-- ENCRYPTED (AES-256-GCM) under TEMP_CREDENTIAL_KEY, a key held only in the
-- server environment and never in this database. `sealed` is a ciphertext,
-- never plaintext, and it is emptied as soon as the credential stops being
-- revealable: the Admin chose their own password, a Super Admin reissued one,
-- or the reveal window closed. A permanent password is never stored here.

-- CreateTable
CREATE TABLE "temporary_credentials" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "sealed" TEXT NOT NULL,
    "created_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" VARCHAR(32),

    CONSTRAINT "temporary_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "temporary_credentials_user_id_idx" ON "temporary_credentials"("user_id");

-- CreateIndex
CREATE INDEX "temporary_credentials_expires_at_idx" ON "temporary_credentials"("expires_at");

-- AddForeignKey
ALTER TABLE "temporary_credentials" ADD CONSTRAINT "temporary_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_credentials" ADD CONSTRAINT "temporary_credentials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

