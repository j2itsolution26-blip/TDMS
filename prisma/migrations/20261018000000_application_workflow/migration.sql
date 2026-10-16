-- Application workflow (additive only; nothing is dropped or rewritten).
--
--   * applications: application number, suffix, address, emergency contact,
--     school year, educational background, submitted_at, created_by.
--     status gains the values draft and rejected (a text column).
--   * application_documents: each requirement's file or paper copy and its
--     verification on an application, before any student record exists.
--     Copied into student_credentials when the application is approved.
--   * Existing applications get a number and keep their status.

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "address" TEXT,
ADD COLUMN     "application_number" VARCHAR(32),
ADD COLUMN     "created_by" BIGINT,
ADD COLUMN     "education_notes" TEXT,
ADD COLUMN     "emergency_contact_name" VARCHAR(255),
ADD COLUMN     "emergency_contact_phone" VARCHAR(30),
ADD COLUMN     "highest_education" VARCHAR(40),
ADD COLUMN     "previous_school" VARCHAR(255),
ADD COLUMN     "school_year_id" BIGINT,
ADD COLUMN     "submitted_at" TIMESTAMP(0),
ADD COLUMN     "suffix" VARCHAR(20),
ADD COLUMN     "year_graduated" SMALLINT;

-- CreateTable
CREATE TABLE "application_documents" (
    "id" BIGSERIAL NOT NULL,
    "application_id" BIGINT NOT NULL,
    "credential_requirement_id" BIGINT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "file_key" VARCHAR(255),
    "file_name" VARCHAR(255),
    "file_type" VARCHAR(120),
    "file_size" INTEGER,
    "remarks" TEXT,
    "submitted_by" BIGINT,
    "submitted_at" TIMESTAMP(0),
    "verified_by" BIGINT,
    "verified_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_documents_credential_requirement_id_idx" ON "application_documents"("credential_requirement_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_documents_unique" ON "application_documents"("application_id", "credential_requirement_id");

-- CreateIndex
CREATE UNIQUE INDEX "applications_application_number_unique" ON "applications"("application_number");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_credential_requirement_id_fkey" FOREIGN KEY ("credential_requirement_id") REFERENCES "credential_requirements"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- Backfill: numbers for existing applications, and their submission time.
UPDATE "applications"
SET "application_number" = 'APP-' || to_char(COALESCE("created_at", now()), 'YYYY') || '-' || lpad("id"::text, 4, '0')
WHERE "application_number" IS NULL;

UPDATE "applications"
SET "submitted_at" = "created_at"
WHERE "submitted_at" IS NULL AND "status" <> 'draft';
