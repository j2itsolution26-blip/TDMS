-- Staff accounts are managed by the Admin, and only the Admin.
--
--   SUPER ADMIN   system maintenance: creates and controls Admins
--        |
--      ADMIN       creates and manages staff
--        +-- Director, Coordinator, Secretary, Teacher
--
-- Removes the `accounts.manage` permission from two roles:
--
--   super_admin  It never depended on this permission: the Laravel-era blanket
--                grant let a Super Admin through every check anyway. The Staff
--                policy now excludes the Super Admin explicitly, and this row
--                is removed so the permission table says the same thing the
--                code does.
--
--   director     A Director could previously invite and manage staff
--                alongside the Admin. That now belongs to the Admin alone.
--                Every other Director permission is untouched.
--
-- Data-only. No table, column or constraint changes, no account is touched,
-- and no role loses anything but this one permission. It matches the role
-- matrix in prisma/seed.ts, which syncs to the same result, so running the
-- seed afterwards is a no-op for these rows.
--
-- To undo, re-grant the permission:
--   INSERT INTO role_has_permissions (permission_id, role_id)
--   SELECT p.id, r.id FROM permissions p, roles r
--   WHERE p.name = 'accounts.manage' AND p.guard_name = 'web'
--     AND r.name = 'director' AND r.guard_name = 'web'
--   ON CONFLICT DO NOTHING;

DELETE FROM "role_has_permissions" rhp
USING "permissions" p, "roles" r
WHERE rhp."permission_id" = p."id"
  AND rhp."role_id" = r."id"
  AND p."name" = 'accounts.manage'
  AND p."guard_name" = 'web'
  AND r."name" IN ('super_admin', 'director')
  AND r."guard_name" = 'web';
