-- Credential document history (additive only; nothing is dropped or rewritten).
--
--   * student_credential_documents: one row per soft copy handed in for a
--     credential — its private storage key, name, type, size, version,
--     uploader, and the review verdict on that version. A replacement adds a
--     row and marks the previous one superseded; no file is forgotten.
--   * Every credential that already has a file gets one row for it, with its
--     existing version number and verdict, so the history starts complete.
--     student_credentials itself is not changed.

-- CreateTable
CREATE TABLE "student_credential_documents" (
    "id" BIGSERIAL NOT NULL,
    "student_credential_id" BIGINT NOT NULL,
    "version" INTEGER NOT NULL,
    "file_path" VARCHAR(255) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_type" VARCHAR(120),
    "file_size" INTEGER,
    "uploaded_by" BIGINT,
    "uploaded_at" TIMESTAMP(0),
    "review_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "reviewed_by" BIGINT,
    "reviewed_at" TIMESTAMP(0),
    "rejection_reason" TEXT,
    "superseded_at" TIMESTAMP(0),
    "previous_document_id" BIGINT,
    "created_at" TIMESTAMP(0),

    CONSTRAINT "student_credential_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_credential_documents_credential_version_unique" ON "student_credential_documents"("student_credential_id", "version");

-- CreateIndex
CREATE INDEX "student_credential_documents_uploaded_by_idx" ON "student_credential_documents"("uploaded_by");

-- CreateIndex
CREATE INDEX "student_credential_documents_reviewed_by_idx" ON "student_credential_documents"("reviewed_by");

-- CreateIndex
CREATE INDEX "student_credential_documents_previous_document_id_idx" ON "student_credential_documents"("previous_document_id");

-- AddForeignKey
ALTER TABLE "student_credential_documents" ADD CONSTRAINT "student_credential_documents_credential_foreign" FOREIGN KEY ("student_credential_id") REFERENCES "student_credentials"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "student_credential_documents" ADD CONSTRAINT "student_credential_documents_uploaded_by_foreign" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "student_credential_documents" ADD CONSTRAINT "student_credential_documents_reviewed_by_foreign" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "student_credential_documents" ADD CONSTRAINT "student_credential_documents_previous_foreign" FOREIGN KEY ("previous_document_id") REFERENCES "student_credential_documents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Backfill: the file each credential already has becomes its first history row.
INSERT INTO "student_credential_documents" (
    "student_credential_id", "version", "file_path", "file_name", "file_type", "file_size",
    "uploaded_by", "uploaded_at", "review_status", "reviewed_by", "reviewed_at", "rejection_reason", "created_at"
)
SELECT
    sc."id",
    sc."version",
    sc."file_path",
    COALESCE(sc."file_name", cr."name" || ' (v' || sc."version" || ')' || COALESCE('.' || lower(substring(sc."file_path" from '\.([A-Za-z0-9]+)$')), '')),
    COALESCE(sc."file_type", CASE lower(substring(sc."file_path" from '\.([A-Za-z0-9]+)$'))
        WHEN 'pdf' THEN 'application/pdf'
        WHEN 'jpg' THEN 'image/jpeg'
        WHEN 'jpeg' THEN 'image/jpeg'
        WHEN 'png' THEN 'image/png'
        ELSE NULL END),
    sc."file_size",
    sc."submitted_by",
    sc."submitted_at",
    CASE sc."status" WHEN 'verified' THEN 'verified' WHEN 'rejected' THEN 'rejected' ELSE 'pending' END,
    CASE WHEN sc."status" IN ('verified', 'rejected') THEN sc."verified_by" END,
    CASE WHEN sc."status" IN ('verified', 'rejected') THEN sc."verified_at" END,
    CASE WHEN sc."status" = 'rejected' THEN sc."rejection_reason" END,
    CURRENT_TIMESTAMP
FROM "student_credentials" sc
JOIN "credential_requirements" cr ON cr."id" = sc."credential_requirement_id"
WHERE sc."file_path" IS NOT NULL;
