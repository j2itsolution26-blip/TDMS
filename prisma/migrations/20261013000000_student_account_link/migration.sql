-- One login per student record, and one student record per login.
--
-- A unique index on students.user_id. Students without an account keep a
-- NULL user_id, which a PostgreSQL unique index allows any number of times.
-- No row is changed. It fails only if two students already share one login;
-- the production database had no linked students when this was written.

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_unique" ON "students"("user_id");
