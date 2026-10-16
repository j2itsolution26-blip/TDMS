-- Soft copies of student credentials: the uploaded file's own name, type and size.
-- Additive and nullable: existing rows are unchanged (their files show as
-- "<requirement> (vN)" until replaced), and nothing is rewritten.
ALTER TABLE "student_credentials" ADD COLUMN "file_name" VARCHAR(255);
ALTER TABLE "student_credentials" ADD COLUMN "file_type" VARCHAR(120);
ALTER TABLE "student_credentials" ADD COLUMN "file_size" INTEGER;
