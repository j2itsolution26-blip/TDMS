-- Account lifecycle + email verification.
--
-- Purely additive: one new column and two new tables. Nothing is dropped,
-- renamed or rewritten.
--
-- `users.status` becomes the authoritative account state. `users.is_active`
-- is superseded but deliberately kept, so this migration does not have to
-- drop a column on a live database; application code writes both together
-- (is_active = status = 'ACTIVE') so they cannot drift.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING_VERIFICATION';

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_requests" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_unique" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_requests_token_hash_unique" ON "password_reset_requests"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_requests_user_id_idx" ON "password_reset_requests"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_requests_expires_at_idx" ON "password_reset_requests"("expires_at");

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill `status` for rows that predate it, from the two signals that
-- previously encoded the same thing. Without this every existing account
-- would silently land on the column default and be locked out as pending.
UPDATE "users"
SET "status" = CASE
    WHEN "is_active" = false                  THEN 'INACTIVE'
    WHEN "email_verified_at" IS NOT NULL      THEN 'ACTIVE'
    ELSE 'PENDING_VERIFICATION'
END;
