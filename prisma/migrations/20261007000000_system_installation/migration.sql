-- First-run state: one row once the installation has been set up.
--
-- Purely additive: a new table, nothing altered or dropped. The CHECK pins
-- the primary key to 1, so the table can never hold more than one row and a
-- second concurrent first-run setup fails on the key instead of creating a
-- second Super Admin.
--
-- A database that already has accounts was set up before this table existed,
-- so it is backfilled as initialized. Otherwise deploying this migration would
-- reopen /setup on a live system.

-- CreateTable
CREATE TABLE "system_installation" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "initialized_at" TIMESTAMP(0) NOT NULL,
    "method" VARCHAR(32) NOT NULL,

    CONSTRAINT "system_installation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "system_installation_single_row" CHECK ("id" = 1)
);

-- Backfill
INSERT INTO "system_installation" ("id", "initialized_at", "method")
SELECT 1, CURRENT_TIMESTAMP, 'pre-existing'
WHERE EXISTS (SELECT 1 FROM "users");
