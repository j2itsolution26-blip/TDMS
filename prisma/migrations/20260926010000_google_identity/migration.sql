-- Google identity on the users table.
--
-- Additive: five nullable columns, one unique index, and a change to the
-- default of an existing column. No data is deleted and no column is dropped.
--
-- google_id holds Google's `sub`, which is the stable join key for repeat
-- sign-ins: an address can change, `sub` does not. UNIQUE so one Google
-- account cannot end up attached to two TDMS accounts. Nullable because
-- credential-only accounts have no Google identity.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "first_name" VARCHAR(255),
ADD COLUMN     "google_id" VARCHAR(255),
ADD COLUMN     "last_login_at" TIMESTAMP(0),
ADD COLUMN     "last_name" VARCHAR(255),
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_unique" ON "users"("google_id");

-- Rename the pending state to the four-state vocabulary the application now
-- uses: PENDING covers "created but not yet permitted in", whether that is
-- awaiting email verification or awaiting an administrator's approval.
-- emailVerifiedAt tells the two apart, so a fifth state would only be noise.
UPDATE "users" SET "status" = 'PENDING' WHERE "status" = 'PENDING_VERIFICATION';

-- Backfill the split name from the single display name, so Google's
-- given_name/family_name have somewhere consistent to land. Best effort:
-- everything before the first space is the first name, the remainder the
-- last name. Google overwrites both on first sign-in.
UPDATE "users"
SET "first_name" = COALESCE("first_name", NULLIF(split_part("name", ' ', 1), '')),
    "last_name"  = COALESCE("last_name",
                     NULLIF(regexp_replace("name", '^\S+\s*', ''), ''))
WHERE "first_name" IS NULL OR "last_name" IS NULL;
