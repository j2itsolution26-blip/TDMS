-- Access-code revocation, for the Super Admin Dashboard's Access Codes page.
--
-- An access code now has four visible states — ACTIVE, USED, EXPIRED, REVOKED —
-- and the page needs to say why a code was revoked and by whom. So:
--
--   invalidated_at  -> revoked_at     renamed, not dropped: same meaning, the
--                                     name the dashboard and audit trail use.
--   revoked_reason                    revoked | superseded | attempts_exhausted
--                                     | account_suspended | password_reset
--   revoked_by                        the Super Admin who revoked it by hand;
--                                     null for automatic revocations.
--
-- A RENAME rather than the DROP + ADD that `prisma migrate diff` suggests, so
-- no value is lost even if the table has rows. Nothing else changes.

-- AlterTable
ALTER TABLE "admin_access_codes" RENAME COLUMN "invalidated_at" TO "revoked_at";
ALTER TABLE "admin_access_codes" ADD COLUMN "revoked_reason" VARCHAR(32);
ALTER TABLE "admin_access_codes" ADD COLUMN "revoked_by" BIGINT;

-- AddForeignKey
-- Deleting the Super Admin who revoked a code only clears the attribution.
ALTER TABLE "admin_access_codes" ADD CONSTRAINT "admin_access_codes_revoked_by_fkey"
    FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
