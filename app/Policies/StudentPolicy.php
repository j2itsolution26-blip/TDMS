<?php

namespace App\Policies;

use App\Models\Student;
use App\Models\User;

class StudentPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('students.manage');
    }

    public function view(User $user, Student $student): bool
    {
        return $user->can('students.manage');
    }

    public function create(User $user): bool
    {
        return $user->can('students.manage');
    }

    public function update(User $user, Student $student): bool
    {
        return $user->can('students.manage');
    }

    /**
     * Student records are never hard-deleted — archive via the status
     * field instead, which preserves the historical record (dossier §28).
     */
    public function delete(User $user, Student $student): bool
    {
        return false;
    }
}
