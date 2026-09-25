-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."applications" (
    "id" BIGSERIAL NOT NULL,
    "first_name" VARCHAR(255) NOT NULL,
    "middle_name" VARCHAR(255),
    "last_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(255),
    "date_of_birth" DATE,
    "program_id" BIGINT NOT NULL,
    "status" VARCHAR(255) NOT NULL DEFAULT 'submitted',
    "notes" TEXT,
    "reviewed_by" BIGINT,
    "reviewed_at" TIMESTAMP(0),
    "student_id" BIGINT,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "action" VARCHAR(255) NOT NULL,
    "actor" VARCHAR(255) NOT NULL,
    "target" VARCHAR(255) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "details" JSON,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cache" (
    "key" VARCHAR(255) NOT NULL,
    "value" TEXT NOT NULL,
    "expiration" BIGINT NOT NULL,

    CONSTRAINT "cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."cache_locks" (
    "key" VARCHAR(255) NOT NULL,
    "owner" VARCHAR(255) NOT NULL,
    "expiration" BIGINT NOT NULL,

    CONSTRAINT "cache_locks_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."credential_requirements" (
    "id" BIGSERIAL NOT NULL,
    "program_id" BIGINT,
    "name" VARCHAR(255) NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "credential_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."curricula" (
    "id" BIGSERIAL NOT NULL,
    "program_id" BIGINT NOT NULL,
    "version_label" VARCHAR(255) NOT NULL,
    "effective_school_year" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."curriculum_subjects" (
    "id" BIGSERIAL NOT NULL,
    "curriculum_id" BIGINT NOT NULL,
    "subject_id" BIGINT NOT NULL,
    "prerequisite_subject_id" BIGINT,
    "year_level" SMALLINT NOT NULL,
    "semester" SMALLINT NOT NULL,
    "units" DECIMAL(4,1) NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "curriculum_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."enrollment_status_history" (
    "id" BIGSERIAL NOT NULL,
    "enrollment_id" BIGINT NOT NULL,
    "from_status" VARCHAR(255),
    "to_status" VARCHAR(255) NOT NULL,
    "changed_by" BIGINT,
    "reason" TEXT,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."enrollments" (
    "id" BIGSERIAL NOT NULL,
    "student_id" BIGINT NOT NULL,
    "curriculum_id" BIGINT NOT NULL,
    "school_year" VARCHAR(255) NOT NULL,
    "semester" SMALLINT NOT NULL,
    "year_level" SMALLINT NOT NULL,
    "status" VARCHAR(255) NOT NULL DEFAULT 'pending',
    "approved_by" BIGINT,
    "approved_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."failed_jobs" (
    "id" BIGSERIAL NOT NULL,
    "uuid" VARCHAR(255) NOT NULL,
    "connection" VARCHAR(255) NOT NULL,
    "queue" VARCHAR(255) NOT NULL,
    "payload" TEXT NOT NULL,
    "exception" TEXT NOT NULL,
    "failed_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."job_batches" (
    "id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "total_jobs" INTEGER NOT NULL,
    "pending_jobs" INTEGER NOT NULL,
    "failed_jobs" INTEGER NOT NULL,
    "failed_job_ids" TEXT NOT NULL,
    "options" TEXT,
    "cancelled_at" INTEGER,
    "created_at" INTEGER NOT NULL,
    "finished_at" INTEGER,

    CONSTRAINT "job_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."jobs" (
    "id" BIGSERIAL NOT NULL,
    "queue" VARCHAR(255) NOT NULL,
    "payload" TEXT NOT NULL,
    "attempts" SMALLINT NOT NULL,
    "reserved_at" INTEGER,
    "available_at" INTEGER NOT NULL,
    "created_at" INTEGER NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."migrations" (
    "id" SERIAL NOT NULL,
    "migration" VARCHAR(255) NOT NULL,
    "batch" INTEGER NOT NULL,

    CONSTRAINT "migrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."model_has_permissions" (
    "permission_id" BIGINT NOT NULL,
    "model_type" VARCHAR(255) NOT NULL,
    "model_id" BIGINT NOT NULL,

    CONSTRAINT "model_has_permissions_pkey" PRIMARY KEY ("permission_id","model_id","model_type")
);

-- CreateTable
CREATE TABLE "public"."model_has_roles" (
    "role_id" BIGINT NOT NULL,
    "model_type" VARCHAR(255) NOT NULL,
    "model_id" BIGINT NOT NULL,

    CONSTRAINT "model_has_roles_pkey" PRIMARY KEY ("role_id","model_id","model_type")
);

-- CreateTable
CREATE TABLE "public"."password_reset_tokens" (
    "email" VARCHAR(255) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(0),

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "public"."permissions" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "guard_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."programs" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."role_has_permissions" (
    "permission_id" BIGINT NOT NULL,
    "role_id" BIGINT NOT NULL,

    CONSTRAINT "role_has_permissions_pkey" PRIMARY KEY ("permission_id","role_id")
);

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "guard_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" VARCHAR(255) NOT NULL,
    "user_id" BIGINT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "payload" TEXT NOT NULL,
    "last_activity" INTEGER NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."student_credentials" (
    "id" BIGSERIAL NOT NULL,
    "student_id" BIGINT NOT NULL,
    "credential_requirement_id" BIGINT NOT NULL,
    "file_path" VARCHAR(255),
    "submitted_by" BIGINT,
    "submitted_at" TIMESTAMP(0),
    "status" VARCHAR(255) NOT NULL DEFAULT 'missing',
    "verified_by" BIGINT,
    "verified_at" TIMESTAMP(0),
    "remarks" TEXT,
    "rejection_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "student_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."students" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "student_number" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(255) NOT NULL,
    "middle_name" VARCHAR(255),
    "last_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(255),
    "date_of_birth" DATE,
    "program_id" BIGINT NOT NULL,
    "curriculum_id" BIGINT NOT NULL,
    "year_level" SMALLINT NOT NULL DEFAULT 1,
    "status" VARCHAR(255) NOT NULL DEFAULT 'active',
    "enrollment_date" DATE,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."subjects" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "subject_type" VARCHAR(255) NOT NULL,
    "default_units" DECIMAL(4,1) NOT NULL,
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "email_verified_at" TIMESTAMP(0),
    "password" VARCHAR(255) NOT NULL,
    "remember_token" VARCHAR(100),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cache_expiration_index" ON "public"."cache"("expiration" ASC);

-- CreateIndex
CREATE INDEX "cache_locks_expiration_index" ON "public"."cache_locks"("expiration" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "curricula_program_id_version_label_unique" ON "public"."curricula"("program_id" ASC, "version_label" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_subjects_curriculum_id_subject_id_unique" ON "public"."curriculum_subjects"("curriculum_id" ASC, "subject_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_id_school_year_semester_unique" ON "public"."enrollments"("student_id" ASC, "school_year" ASC, "semester" ASC);

-- CreateIndex
CREATE INDEX "failed_jobs_connection_queue_failed_at_index" ON "public"."failed_jobs"("connection" ASC, "queue" ASC, "failed_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "failed_jobs_uuid_unique" ON "public"."failed_jobs"("uuid" ASC);

-- CreateIndex
CREATE INDEX "jobs_queue_index" ON "public"."jobs"("queue" ASC);

-- CreateIndex
CREATE INDEX "model_has_permissions_model_id_model_type_index" ON "public"."model_has_permissions"("model_id" ASC, "model_type" ASC);

-- CreateIndex
CREATE INDEX "model_has_roles_model_id_model_type_index" ON "public"."model_has_roles"("model_id" ASC, "model_type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_guard_name_unique" ON "public"."permissions"("name" ASC, "guard_name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "programs_code_unique" ON "public"."programs"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_guard_name_unique" ON "public"."roles"("name" ASC, "guard_name" ASC);

-- CreateIndex
CREATE INDEX "sessions_last_activity_index" ON "public"."sessions"("last_activity" ASC);

-- CreateIndex
CREATE INDEX "sessions_user_id_index" ON "public"."sessions"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "student_credentials_student_id_credential_requirement_id_unique" ON "public"."student_credentials"("student_id" ASC, "credential_requirement_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "students_student_number_unique" ON "public"."students"("student_number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_unique" ON "public"."subjects"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_unique" ON "public"."users"("email" ASC);

-- AddForeignKey
ALTER TABLE "public"."applications" ADD CONSTRAINT "applications_program_id_foreign" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."applications" ADD CONSTRAINT "applications_reviewed_by_foreign" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."applications" ADD CONSTRAINT "applications_student_id_foreign" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."credential_requirements" ADD CONSTRAINT "credential_requirements_program_id_foreign" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."curricula" ADD CONSTRAINT "curricula_program_id_foreign" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."curriculum_subjects" ADD CONSTRAINT "curriculum_subjects_curriculum_id_foreign" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."curriculum_subjects" ADD CONSTRAINT "curriculum_subjects_prerequisite_subject_id_foreign" FOREIGN KEY ("prerequisite_subject_id") REFERENCES "public"."subjects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."curriculum_subjects" ADD CONSTRAINT "curriculum_subjects_subject_id_foreign" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."enrollment_status_history" ADD CONSTRAINT "enrollment_status_history_changed_by_foreign" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."enrollment_status_history" ADD CONSTRAINT "enrollment_status_history_enrollment_id_foreign" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."enrollments" ADD CONSTRAINT "enrollments_approved_by_foreign" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."enrollments" ADD CONSTRAINT "enrollments_curriculum_id_foreign" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."enrollments" ADD CONSTRAINT "enrollments_student_id_foreign" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."model_has_permissions" ADD CONSTRAINT "model_has_permissions_permission_id_foreign" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."model_has_roles" ADD CONSTRAINT "model_has_roles_role_id_foreign" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."role_has_permissions" ADD CONSTRAINT "role_has_permissions_permission_id_foreign" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."role_has_permissions" ADD CONSTRAINT "role_has_permissions_role_id_foreign" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."student_credentials" ADD CONSTRAINT "student_credentials_credential_requirement_id_foreign" FOREIGN KEY ("credential_requirement_id") REFERENCES "public"."credential_requirements"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."student_credentials" ADD CONSTRAINT "student_credentials_student_id_foreign" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."student_credentials" ADD CONSTRAINT "student_credentials_submitted_by_foreign" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."student_credentials" ADD CONSTRAINT "student_credentials_verified_by_foreign" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."students" ADD CONSTRAINT "students_curriculum_id_foreign" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."students" ADD CONSTRAINT "students_program_id_foreign" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."students" ADD CONSTRAINT "students_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

