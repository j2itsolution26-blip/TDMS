-- Indexes on foreign keys the app filters and joins by (additive only).
--
-- Postgres does not index a foreign key by itself. These columns are read on
-- every Students, Enrollments, Applications and student-portal page, and on
-- every cascade or restrict check; without an index each is a full scan,
-- which grows every term. Nothing is dropped or rewritten.

-- CreateIndex
CREATE INDEX "applications_program_id_idx" ON "applications"("program_id");

-- CreateIndex
CREATE INDEX "applications_school_year_id_idx" ON "applications"("school_year_id");

-- CreateIndex
CREATE INDEX "applications_student_id_idx" ON "applications"("student_id");

-- CreateIndex
CREATE INDEX "assessment_scores_student_id_idx" ON "assessment_scores"("student_id");

-- CreateIndex
CREATE INDEX "attendance_records_student_id_idx" ON "attendance_records"("student_id");

-- CreateIndex
CREATE INDEX "class_grades_student_id_idx" ON "class_grades"("student_id");

-- CreateIndex
CREATE INDEX "enrollment_status_history_enrollment_id_idx" ON "enrollment_status_history"("enrollment_id");

-- CreateIndex
CREATE INDEX "enrollments_school_year_id_idx" ON "enrollments"("school_year_id");

-- CreateIndex
CREATE INDEX "student_credentials_credential_requirement_id_idx" ON "student_credentials"("credential_requirement_id");

-- CreateIndex
CREATE INDEX "students_program_id_idx" ON "students"("program_id");

