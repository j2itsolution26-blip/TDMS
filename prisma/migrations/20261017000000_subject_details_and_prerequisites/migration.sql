-- Subject details and multiple prerequisites (additive only).
--
--   * subjects: lecture_hours, lab_hours, recommended_class_size, remarks
--     (all optional). Total contact hours is their sum and is not stored.
--     subject_type gains the value lecture_laboratory (a text column).
--   * curriculum_subject_prerequisites: several prerequisites per curriculum
--     entry. The existing single prerequisite_subject_id is copied in and the
--     column kept for history.

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "lab_hours" DECIMAL(4,1),
ADD COLUMN     "lecture_hours" DECIMAL(4,1),
ADD COLUMN     "recommended_class_size" SMALLINT,
ADD COLUMN     "remarks" TEXT;

-- CreateTable
CREATE TABLE "curriculum_subject_prerequisites" (
    "id" BIGSERIAL NOT NULL,
    "curriculum_subject_id" BIGINT NOT NULL,
    "subject_id" BIGINT NOT NULL,

    CONSTRAINT "curriculum_subject_prerequisites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "curriculum_subject_prerequisites_subject_id_idx" ON "curriculum_subject_prerequisites"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_subject_prerequisites_unique" ON "curriculum_subject_prerequisites"("curriculum_subject_id", "subject_id");

-- AddForeignKey
ALTER TABLE "curriculum_subject_prerequisites" ADD CONSTRAINT "curriculum_subject_prerequisites_curriculum_subject_id_fkey" FOREIGN KEY ("curriculum_subject_id") REFERENCES "curriculum_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_subject_prerequisites" ADD CONSTRAINT "curriculum_subject_prerequisites_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Copy each existing single prerequisite into the new table.
INSERT INTO "curriculum_subject_prerequisites" ("curriculum_subject_id", "subject_id")
SELECT "id", "prerequisite_subject_id" FROM "curriculum_subjects"
WHERE "prerequisite_subject_id" IS NOT NULL
ON CONFLICT DO NOTHING;
