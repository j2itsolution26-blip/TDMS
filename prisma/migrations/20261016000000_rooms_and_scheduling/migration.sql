-- Rooms and class scheduling (additive only; nothing is dropped or rewritten).
--
--   * rooms: classrooms and laboratories, deactivated rather than deleted.
--   * classes.room_id / class_schedules.room_id: the room a class or a single
--     meeting is held in. The old free-text room columns stay, for history.
--   * classes.curriculum_subject_id: the curriculum entry a class teaches;
--     nullable so classes created before this change remain valid.
--   * classes.status: ACTIVE | CANCELLED (existing classes become ACTIVE).
--   * curriculum_subjects.is_required: required (default) or elective.
--   * indexes for term views and room conflict lookups.

-- AlterTable
ALTER TABLE "class_schedules" ADD COLUMN     "room_id" BIGINT;

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "curriculum_subject_id" BIGINT,
ADD COLUMN     "room_id" BIGINT,
ADD COLUMN     "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "curriculum_subjects" ADD COLUMN     "is_required" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "rooms" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" VARCHAR(16) NOT NULL DEFAULT 'LECTURE',
    "capacity" SMALLINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_code_unique" ON "rooms"("code");

-- CreateIndex
CREATE INDEX "class_schedules_room_day_index" ON "class_schedules"("room_id", "day_of_week");

-- CreateIndex
CREATE INDEX "classes_term_status_index" ON "classes"("school_year_id", "semester", "status");

-- CreateIndex
CREATE INDEX "curriculum_subjects_term_index" ON "curriculum_subjects"("curriculum_id", "year_level", "semester");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_curriculum_subject_id_fkey" FOREIGN KEY ("curriculum_subject_id") REFERENCES "curriculum_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

