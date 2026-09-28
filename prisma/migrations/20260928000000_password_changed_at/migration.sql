-- When the account holder last chose their own password.
--
-- Purely additive: one nullable column, no default, no backfill. Existing rows
-- read NULL, which is the truth for them — the application has never recorded
-- this before, and inventing a date would be worse than admitting it is
-- unknown. Nothing reads the column to make an authentication decision:
-- `must_change_password` remains the authority on whether the current
-- password is a temporary one.
--
-- Safe to apply BEFORE the code that writes it is deployed: code that does not
-- know the column simply never selects it.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_changed_at" TIMESTAMP(0);
