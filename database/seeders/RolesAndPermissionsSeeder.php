<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolesAndPermissionsSeeder extends Seeder
{
    /**
     * Permissions granted to each role, per the role/permission matrix
     * in the TDMS architecture dossier (§08). Modules built later may
     * add further, more granular permissions to this list.
     */
    private const array ROLE_PERMISSIONS = [
        'super_admin' => [
            'dashboard.view.institutional',
            'programs.manage',
            'subjects.manage',
            'schedule.manage',
            'grades.review-change',
            'grades.publish',
            'practicum.manage',
            'graduation.evaluate',
            'reports.view.full',
            'audit-logs.view',
            'accounts.manage',
            'system.configure',
        ],
        'admin' => [
            'dashboard.view.institutional',
            'programs.manage',
            'subjects.manage',
            'schedule.manage',
            'grades.review-change',
            'grades.publish',
            'graduation.evaluate',
            'reports.view.full',
            'audit-logs.view',
            'accounts.manage',
            // Operational permissions so Admin can cover Secretary-level
            // day-to-day work (applications, credentials, enrollment)
            // without waiting on Super Admin — the point of this role.
            'applications.review',
            'credentials.verify',
            'students.manage',
            'students.enroll',
        ],
        'director' => [
            'dashboard.view.institutional',
            'programs.manage',
            'subjects.manage',
            'grades.review-change',
            'grades.publish',
            'graduation.evaluate',
            'reports.view.full',
            'audit-logs.view',
            'accounts.manage',
        ],
        'coordinator' => [
            'dashboard.view.institutional',
            'programs.manage',
            'subjects.manage',
            'schedule.manage',
            'grades.review-change',
            'grades.publish',
            'practicum.manage',
            'graduation.evaluate',
            'reports.view.full',
            'audit-logs.view.scoped',
        ],
        'secretary' => [
            'applications.review',
            'credentials.verify',
            'students.manage',
            'students.enroll',
            'reports.view.limited',
        ],
        'teacher' => [
            'attendance.record',
            'grades.enter',
            'grades.request-change',
            'practicum.evaluate',
            'reports.view.own-classes',
        ],
        'student' => [
            'academic-records.view.own',
        ],
    ];

    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $permissions = collect(self::ROLE_PERMISSIONS)->flatten()->unique();

        $permissions->each(fn (string $permission) => Permission::findOrCreate($permission, 'web'));

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (self::ROLE_PERMISSIONS as $roleName => $rolePermissions) {
            $role = Role::findOrCreate($roleName, 'web');
            $role->syncPermissions($rolePermissions);
        }
    }
}
