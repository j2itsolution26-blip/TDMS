-- The TVET Processing Officer role.
--
-- Purely additive: one role row and grants of four permissions that already
-- exist. No table is created or altered; no existing row is changed.
--
--   students.manage             learner records (profile, year level, school year)
--   students.enroll             enrollment
--   credentials.verify          document requirements
--   assessment.calendar.manage  the training and assessment calendar
--
-- Idempotent: prisma/seed.ts writes the same rows, and running both is harmless.

INSERT INTO "roles" ("name", "guard_name", "created_at", "updated_at")
SELECT 'processing_officer', 'web', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'processing_officer' AND "guard_name" = 'web');

INSERT INTO "permissions" ("name", "guard_name", "created_at", "updated_at")
SELECT p.name, 'web', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES ('students.manage'), ('students.enroll'), ('credentials.verify'), ('assessment.calendar.manage')) AS p(name)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" x WHERE x."name" = p.name AND x."guard_name" = 'web');

INSERT INTO "role_has_permissions" ("permission_id", "role_id")
SELECT perm."id", role."id"
FROM "permissions" perm, "roles" role
WHERE role."name" = 'processing_officer' AND role."guard_name" = 'web'
  AND perm."name" IN ('students.manage', 'students.enroll', 'credentials.verify', 'assessment.calendar.manage') AND perm."guard_name" = 'web'
  AND NOT EXISTS (SELECT 1 FROM "role_has_permissions" rhp WHERE rhp."permission_id" = perm."id" AND rhp."role_id" = role."id");
