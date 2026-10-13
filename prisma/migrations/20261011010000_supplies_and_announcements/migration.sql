-- Assessment Center supplies (inventory, purchases) and Director announcements.
--
-- Purely additive: three new tables, two permissions and their grants. No
-- existing table is altered and no row is changed or removed.

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" BIGSERIAL NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "unit" VARCHAR(40),
    "quantity_good" INTEGER NOT NULL DEFAULT 0,
    "quantity_defective" INTEGER NOT NULL DEFAULT 0,
    "remarks" VARCHAR(1000),
    "created_by" BIGINT,
    "updated_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" BIGSERIAL NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "item_name" VARCHAR(255) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" VARCHAR(40),
    "status" VARCHAR(16) NOT NULL DEFAULT 'REQUESTED',
    "remarks" VARCHAR(1000),
    "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT,
    "updated_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "audience" VARCHAR(16) NOT NULL,
    "program_id" BIGINT,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" BIGINT,
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_items_category_idx" ON "inventory_items"("category");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_category_name_unique" ON "inventory_items"("category", "name");

-- CreateIndex
CREATE INDEX "purchase_requests_category_idx" ON "purchase_requests"("category");

-- CreateIndex
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests"("status");

-- CreateIndex
CREATE INDEX "announcements_created_at_idx" ON "announcements"("created_at");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Integrity, enforced by the database.
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_quantities_check"
  CHECK ("quantity_good" >= 0 AND "quantity_defective" >= 0);
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_quantity_check"
  CHECK ("quantity" > 0);
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_status_check"
  CHECK ("status" IN ('REQUESTED', 'APPROVED', 'ORDERED', 'DELIVERED', 'CANCELLED'));
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_audience_check"
  CHECK ("audience" IN ('INSTRUCTORS', 'STUDENTS', 'BOTH'));

-- Permissions, so an existing database gets them from `migrate deploy`
-- without re-seeding. Idempotent: prisma/seed.ts writes the same rows.
INSERT INTO "permissions" ("name", "guard_name", "created_at", "updated_at")
SELECT p.name, 'web', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES ('assessment.supplies.manage'), ('announcements.manage')) AS p(name)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" x WHERE x."name" = p.name AND x."guard_name" = 'web');

INSERT INTO "role_has_permissions" ("permission_id", "role_id")
SELECT perm."id", role."id"
FROM "permissions" perm
JOIN "roles" role ON role."guard_name" = 'web'
  AND ((perm."name" = 'assessment.supplies.manage' AND role."name" = 'assessment_center_manager')
    OR (perm."name" = 'announcements.manage' AND role."name" = 'director'))
WHERE perm."guard_name" = 'web'
  AND NOT EXISTS (SELECT 1 FROM "role_has_permissions" rhp WHERE rhp."permission_id" = perm."id" AND rhp."role_id" = role."id");
