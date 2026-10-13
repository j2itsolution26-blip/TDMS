-- TVET Assessment Center: assessment batches, per-attempt results, and the
-- training and assessment calendar, plus the role that manages them.
--
-- Purely additive: three new tables and one new role. No existing table is
-- altered and no row is changed or removed.
--
-- Results are never overwritten once finalized: a reassessment is a new row
-- (attempt + 1) that points at the result it follows. The CHECK constraints
-- below hold the vocabulary at the database, so not even a hand-written
-- query can store a result other than C / NYC, or a finalized result
-- without one.

-- CreateTable
CREATE TABLE "assessment_batches" (
    "id" BIGSERIAL NOT NULL,
    "batch_number" VARCHAR(40) NOT NULL,
    "program_id" BIGINT NOT NULL,
    "assessment_date" DATE NOT NULL,
    "venue" VARCHAR(255),
    "assessor_user_id" BIGINT,
    "assessor_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "finalized_at" TIMESTAMP(3),
    "finalized_by" BIGINT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(500),
    "created_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" BIGSERIAL NOT NULL,
    "batch_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "attempt" SMALLINT NOT NULL DEFAULT 1,
    "result" VARCHAR(8),
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "previous_result_id" BIGINT,
    "remarks" VARCHAR(500),
    "recorded_by" BIGINT,
    "recorded_at" TIMESTAMP(3),
    "finalized_by" BIGINT,
    "finalized_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_activities" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "activity_type" VARCHAR(16) NOT NULL,
    "program_id" BIGINT,
    "batch_id" BIGINT,
    "starts_at" TIMESTAMPTZ(0) NOT NULL,
    "ends_at" TIMESTAMPTZ(0) NOT NULL,
    "venue" VARCHAR(255),
    "assigned_user_id" BIGINT,
    "assigned_name" VARCHAR(255),
    "responsible_user_id" BIGINT,
    "responsible_name" VARCHAR(255),
    "status" VARCHAR(16) NOT NULL DEFAULT 'SCHEDULED',
    "created_by" BIGINT,
    "updated_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_batches_batch_number_unique" ON "assessment_batches"("batch_number");

-- CreateIndex
CREATE INDEX "assessment_batches_program_id_idx" ON "assessment_batches"("program_id");

-- CreateIndex
CREATE INDEX "assessment_batches_assessment_date_idx" ON "assessment_batches"("assessment_date");

-- CreateIndex
CREATE INDEX "assessment_batches_status_idx" ON "assessment_batches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_results_previous_result_id_unique" ON "assessment_results"("previous_result_id");

-- CreateIndex
CREATE INDEX "assessment_results_student_id_idx" ON "assessment_results"("student_id");

-- CreateIndex
CREATE INDEX "assessment_results_status_idx" ON "assessment_results"("status");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_results_batch_student_attempt_unique" ON "assessment_results"("batch_id", "student_id", "attempt");

-- CreateIndex
CREATE INDEX "training_activities_starts_at_idx" ON "training_activities"("starts_at");

-- CreateIndex
CREATE INDEX "training_activities_ends_at_idx" ON "training_activities"("ends_at");

-- AddForeignKey
ALTER TABLE "assessment_batches" ADD CONSTRAINT "assessment_batches_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_batches" ADD CONSTRAINT "assessment_batches_assessor_user_id_fkey" FOREIGN KEY ("assessor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "assessment_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_previous_result_id_fkey" FOREIGN KEY ("previous_result_id") REFERENCES "assessment_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_activities" ADD CONSTRAINT "training_activities_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_activities" ADD CONSTRAINT "training_activities_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "assessment_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_activities" ADD CONSTRAINT "training_activities_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_activities" ADD CONSTRAINT "training_activities_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Vocabulary and integrity, enforced by the database.
ALTER TABLE "assessment_batches" ADD CONSTRAINT "assessment_batches_status_check"
  CHECK ("status" IN ('OPEN', 'FINALIZED', 'CANCELLED'));
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_result_check"
  CHECK ("result" IS NULL OR "result" IN ('C', 'NYC'));
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_status_check"
  CHECK ("status" IN ('PENDING', 'DRAFT', 'FINALIZED', 'CANCELLED'));
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_finalized_has_result_check"
  CHECK ("status" <> 'FINALIZED' OR "result" IS NOT NULL);
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_attempt_check"
  CHECK ("attempt" >= 1);
ALTER TABLE "training_activities" ADD CONSTRAINT "training_activities_type_check"
  CHECK ("activity_type" IN ('TRAINING', 'ASSESSMENT'));
ALTER TABLE "training_activities" ADD CONSTRAINT "training_activities_status_check"
  CHECK ("status" IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));
ALTER TABLE "training_activities" ADD CONSTRAINT "training_activities_time_range_check"
  CHECK ("ends_at" > "starts_at");

-- The role and its two permissions, so an existing database gets them from
-- `migrate deploy` without re-seeding. Idempotent: prisma/seed.ts writes the
-- same rows, and running both is harmless.
INSERT INTO "roles" ("name", "guard_name", "created_at", "updated_at")
SELECT 'assessment_center_manager', 'web', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'assessment_center_manager' AND "guard_name" = 'web');

INSERT INTO "permissions" ("name", "guard_name", "created_at", "updated_at")
SELECT p.name, 'web', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES ('assessment.results.manage'), ('assessment.calendar.manage')) AS p(name)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" x WHERE x."name" = p.name AND x."guard_name" = 'web');

INSERT INTO "role_has_permissions" ("permission_id", "role_id")
SELECT perm."id", role."id"
FROM "permissions" perm, "roles" role
WHERE role."name" = 'assessment_center_manager' AND role."guard_name" = 'web'
  AND perm."name" IN ('assessment.results.manage', 'assessment.calendar.manage') AND perm."guard_name" = 'web'
  AND NOT EXISTS (SELECT 1 FROM "role_has_permissions" rhp WHERE rhp."permission_id" = perm."id" AND rhp."role_id" = role."id");
