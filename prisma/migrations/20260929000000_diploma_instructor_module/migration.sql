-- Diploma Instructor module.
--
-- Purely additive: new tables, two new nullable columns, widened CHECK
-- constraints. Nothing is dropped, renamed or narrowed, so the application as
-- currently deployed keeps working against this schema — it simply does not
-- know the new tables are there.
--
-- Contents:
--   * school years as records, with an ACTIVE/ARCHIVED lifecycle, and the
--     existing enrollments linked to them (their `school_year` text is kept);
--   * sections, section rosters, classes (subject × section × semester, with
--     an assigned Diploma Instructor) and their weekly schedules;
--   * in-app notifications;
--   * attendance sessions and records, and a QR token per student;
--   * assessments, their answer keys and scores, and class grades;
--   * the school calendar, student badges, lesson plan / TOS / PT documents,
--     student status requests, learning support recommendations and the
--     Instructor Personal Data Sheet.
--
-- The generated DDL comes first; the hand-written steps Prisma cannot express
-- (CHECK constraints, a partial unique index, backfills) follow it.

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "qr_token" VARCHAR(64);

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "school_year_id" BIGINT;

-- CreateTable
CREATE TABLE "school_years" (
    "id" BIGSERIAL NOT NULL,
    "label" VARCHAR(20) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'UPCOMING',
    "current_semester" SMALLINT NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "archived_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" BIGSERIAL NOT NULL,
    "school_year_id" BIGINT NOT NULL,
    "program_id" BIGINT NOT NULL,
    "year_level" SMALLINT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_students" (
    "id" BIGSERIAL NOT NULL,
    "section_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "school_year_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "section_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" BIGSERIAL NOT NULL,
    "school_year_id" BIGINT NOT NULL,
    "semester" SMALLINT NOT NULL,
    "section_id" BIGINT NOT NULL,
    "subject_id" BIGINT NOT NULL,
    "instructor_id" BIGINT,
    "room" VARCHAR(50),
    "passing_grade" DECIMAL(5,2) NOT NULL DEFAULT 75,
    "weights" JSONB NOT NULL DEFAULT '{"QUIZ":20,"EXAM":40,"ACTIVITY":20,"PT":20}',
    "grade_status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "grades_finalized_at" TIMESTAMP(3),
    "grades_released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_schedules" (
    "id" BIGSERIAL NOT NULL,
    "class_id" BIGINT NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "room" VARCHAR(50),

    CONSTRAINT "class_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT,
    "href" VARCHAR(255),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" BIGSERIAL NOT NULL,
    "class_id" BIGINT NOT NULL,
    "meeting_date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "late_after_minutes" SMALLINT NOT NULL DEFAULT 15,
    "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    "opened_by" BIGINT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" BIGSERIAL NOT NULL,
    "session_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "time_in" TIMESTAMP(3),
    "time_out" TIMESTAMP(3),
    "method" VARCHAR(16) NOT NULL DEFAULT 'QR',
    "recorded_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" BIGSERIAL NOT NULL,
    "class_id" BIGINT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "exam_type" VARCHAR(16),
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "opens_at" TIMESTAMP(3),
    "closes_at" TIMESTAMP(3),
    "duration_minutes" INTEGER,
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "total_points" DECIMAL(7,2) NOT NULL,
    "passing_score" DECIMAL(7,2),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "online_enabled" BOOLEAN NOT NULL DEFAULT false,
    "score_status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "released_at" TIMESTAMP(3),
    "created_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_items" (
    "id" BIGSERIAL NOT NULL,
    "assessment_id" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "prompt" TEXT,
    "choices" JSONB,
    "answer" VARCHAR(255) NOT NULL,
    "points" DECIMAL(6,2) NOT NULL DEFAULT 1,

    CONSTRAINT "assessment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_scores" (
    "id" BIGSERIAL NOT NULL,
    "assessment_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "points" DECIMAL(7,2),
    "answers" JSONB,
    "source" VARCHAR(16) NOT NULL,
    "started_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "entered_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_grades" (
    "id" BIGSERIAL NOT NULL,
    "class_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "percent" DECIMAL(6,2),
    "remarks" VARCHAR(32),
    "note" TEXT,
    "updated_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" BIGSERIAL NOT NULL,
    "school_year_id" BIGINT,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" VARCHAR(24) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "created_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_badges" (
    "id" BIGSERIAL NOT NULL,
    "student_id" BIGINT NOT NULL,
    "class_id" BIGINT,
    "badge" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "message" TEXT,
    "awarded_on" DATE NOT NULL,
    "awarded_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_documents" (
    "id" BIGSERIAL NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "class_id" BIGINT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "document_date" DATE,
    "details" JSONB,
    "file_key" VARCHAR(512),
    "file_name" VARCHAR(255),
    "file_type" VARCHAR(128),
    "file_size" INTEGER,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "review_note" TEXT,
    "reviewed_by" BIGINT,
    "reviewed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "created_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_status_requests" (
    "id" BIGSERIAL NOT NULL,
    "student_id" BIGINT NOT NULL,
    "class_id" BIGINT,
    "current_status" VARCHAR(32) NOT NULL,
    "requested_status" VARCHAR(32) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "requested_by" BIGINT,
    "decided_by" BIGINT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_status_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_supports" (
    "id" BIGSERIAL NOT NULL,
    "student_id" BIGINT NOT NULL,
    "class_id" BIGINT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "evidence" TEXT,
    "interventions" JSONB NOT NULL DEFAULT '[]',
    "support" TEXT,
    "follow_up_on" DATE,
    "notes" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    "created_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_supports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructor_profiles" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "employee_id" VARCHAR(64),
    "personal" JSONB NOT NULL DEFAULT '{}',
    "family" JSONB NOT NULL DEFAULT '{}',
    "education" JSONB NOT NULL DEFAULT '[]',
    "eligibility" JSONB NOT NULL DEFAULT '[]',
    "work" JSONB NOT NULL DEFAULT '[]',
    "training" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instructor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_years_label_unique" ON "school_years"("label");

-- CreateIndex
CREATE INDEX "school_years_status_idx" ON "school_years"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sections_unique" ON "sections"("school_year_id", "program_id", "year_level", "name");

-- CreateIndex
CREATE INDEX "section_students_section_id_idx" ON "section_students"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "section_students_one_per_year" ON "section_students"("school_year_id", "student_id");

-- CreateIndex
CREATE INDEX "classes_instructor_id_idx" ON "classes"("instructor_id");

-- CreateIndex
CREATE INDEX "classes_school_year_id_idx" ON "classes"("school_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "classes_unique" ON "classes"("section_id", "subject_id", "semester");

-- CreateIndex
CREATE INDEX "class_schedules_class_id_idx" ON "class_schedules"("class_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_unique" ON "attendance_sessions"("class_id", "meeting_date", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_unique" ON "attendance_records"("session_id", "student_id");

-- CreateIndex
CREATE INDEX "assessments_class_id_idx" ON "assessments"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_items_unique" ON "assessment_items"("assessment_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_scores_unique" ON "assessment_scores"("assessment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_grades_unique" ON "class_grades"("class_id", "student_id");

-- CreateIndex
CREATE INDEX "calendar_events_starts_on_idx" ON "calendar_events"("starts_on");

-- CreateIndex
CREATE INDEX "student_badges_student_id_idx" ON "student_badges"("student_id");

-- CreateIndex
CREATE INDEX "academic_documents_class_id_idx" ON "academic_documents"("class_id");

-- CreateIndex
CREATE INDEX "academic_documents_kind_status_idx" ON "academic_documents"("kind", "status");

-- CreateIndex
CREATE INDEX "student_status_requests_status_idx" ON "student_status_requests"("status");

-- CreateIndex
CREATE INDEX "learning_supports_class_id_idx" ON "learning_supports"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "instructor_profiles_user_unique" ON "instructor_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_qr_token_unique" ON "students"("qr_token");

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_students" ADD CONSTRAINT "section_students_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_students" ADD CONSTRAINT "section_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_grades" ADD CONSTRAINT "class_grades_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_grades" ADD CONSTRAINT "class_grades_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_documents" ADD CONSTRAINT "academic_documents_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_status_requests" ADD CONSTRAINT "student_status_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_status_requests" ADD CONSTRAINT "student_status_requests_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_supports" ADD CONSTRAINT "learning_supports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_supports" ADD CONSTRAINT "learning_supports_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_profiles" ADD CONSTRAINT "instructor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===========================================================================
-- Hand-written steps
-- ===========================================================================

-- Student statuses: add "dropped" and "inactive", which a Diploma Instructor
-- may now recommend. Widening only — every existing value stays valid.
-- "Completed" maps onto the existing "graduated".
ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "students_status_check";
ALTER TABLE "students" ADD CONSTRAINT "students_status_check" CHECK (
    (status)::text = ANY (ARRAY['applicant', 'active', 'transferred', 'archived', 'graduated', 'dropped', 'inactive']::text[])
);

-- At most one ACTIVE school year. A partial unique index: every ACTIVE row
-- shares the same `status` value, so a second one collides.
CREATE UNIQUE INDEX "school_years_one_active" ON "school_years" ("status") WHERE "status" = 'ACTIVE';

-- The same CHECK-constraint convention the rest of this database uses: the
-- database is the authority on which values a status column may hold.
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_status_check"
    CHECK ((status)::text = ANY (ARRAY['UPCOMING', 'ACTIVE', 'ARCHIVED']::text[]));
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_label_check"
    CHECK (label ~ '^[0-9]{4}-[0-9]{4}$');
ALTER TABLE "classes" ADD CONSTRAINT "classes_grade_status_check"
    CHECK ((grade_status)::text = ANY (ARRAY['DRAFT', 'FINALIZED', 'RELEASED']::text[]));
ALTER TABLE "classes" ADD CONSTRAINT "classes_semester_check" CHECK (semester IN (1, 2, 3));
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_day_check" CHECK (day_of_week BETWEEN 0 AND 6);
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_status_check"
    CHECK ((status)::text = ANY (ARRAY['OPEN', 'CLOSED']::text[]));
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_status_check"
    CHECK ((status)::text = ANY (ARRAY['PRESENT', 'LATE', 'ABSENT', 'EXCUSED']::text[]));
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_kind_check"
    CHECK ((kind)::text = ANY (ARRAY['QUIZ', 'EXAM', 'ACTIVITY', 'PT']::text[]));
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_score_status_check"
    CHECK ((score_status)::text = ANY (ARRAY['DRAFT', 'FINALIZED', 'RELEASED']::text[]));
ALTER TABLE "academic_documents" ADD CONSTRAINT "academic_documents_kind_check"
    CHECK ((kind)::text = ANY (ARRAY['LESSON_PLAN', 'TOS', 'PT']::text[]));
ALTER TABLE "academic_documents" ADD CONSTRAINT "academic_documents_status_check"
    CHECK ((status)::text = ANY (ARRAY['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'RETURNED']::text[]));
ALTER TABLE "student_status_requests" ADD CONSTRAINT "student_status_requests_status_check"
    CHECK ((status)::text = ANY (ARRAY['PENDING', 'APPROVED', 'REJECTED']::text[]));
ALTER TABLE "learning_supports" ADD CONSTRAINT "learning_supports_status_check"
    CHECK ((status)::text = ANY (ARRAY['OPEN', 'IN_PROGRESS', 'RESOLVED']::text[]));

-- ---------------------------------------------------------------------------
-- Backfill: school years from the enrollments that already name one.
--
-- Each distinct "YYYY-YYYY" string becomes a school year running June 1 to
-- May 31. The latest becomes ACTIVE and any earlier ones ARCHIVED — they are
-- in the past, and an archived year is read-only, which is the point.
-- Strings not in YYYY-YYYY form are left unlinked rather than guessed at.
-- ---------------------------------------------------------------------------
INSERT INTO "school_years" ("label", "starts_on", "ends_on", "status", "current_semester")
SELECT DISTINCT
    e."school_year",
    make_date(split_part(e."school_year", '-', 1)::int, 6, 1),
    make_date(split_part(e."school_year", '-', 2)::int, 5, 31),
    'ARCHIVED',
    1
FROM "enrollments" e
WHERE e."school_year" ~ '^[0-9]{4}-[0-9]{4}$'
ON CONFLICT ("label") DO NOTHING;

-- A database with no enrollments still needs a current school year.
INSERT INTO "school_years" ("label", "starts_on", "ends_on", "status", "current_semester")
SELECT
    y || '-' || (y + 1),
    make_date(y, 6, 1),
    make_date(y + 1, 5, 31),
    'ARCHIVED',
    1
FROM (
    SELECT CASE WHEN extract(month FROM now() AT TIME ZONE 'Asia/Manila') >= 6
                THEN extract(year FROM now() AT TIME ZONE 'Asia/Manila')::int
                ELSE extract(year FROM now() AT TIME ZONE 'Asia/Manila')::int - 1 END AS y
) current_year
WHERE NOT EXISTS (SELECT 1 FROM "school_years");

UPDATE "school_years" SET "status" = 'ACTIVE'
WHERE "id" = (SELECT "id" FROM "school_years" ORDER BY "label" DESC LIMIT 1);

UPDATE "enrollments" e SET "school_year_id" = sy."id"
FROM "school_years" sy
WHERE sy."label" = e."school_year" AND e."school_year_id" IS NULL;

-- ---------------------------------------------------------------------------
-- Backfill: an attendance QR token for every existing student.
--
-- gen_random_uuid() draws from the server's cryptographic generator, so two
-- of them give 244 random bits — a token nobody can derive from a student
-- number. Students created later get one from the application on first use.
-- ---------------------------------------------------------------------------
UPDATE "students"
SET "qr_token" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE "qr_token" IS NULL;
