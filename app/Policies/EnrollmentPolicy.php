<?php

namespace App\Policies;

use App\Models\Enrollment;
use App\Models\User;

class EnrollmentPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasAnyRole(['director', 'coordinator', 'secretary']);
    }

    public function view(User $user, Enrollment $enrollment): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $user->can('students.enroll');
    }

    public function transition(User $user, Enrollment $enrollment): bool
    {
        return $user->can('students.enroll');
    }

    /**
     * Enrollment records are never deleted — a dropped term stays on the
     * student's history rather than disappearing (dossier §26).
     */
    public function delete(User $user, Enrollment $enrollment): bool
    {
        return false;
    }
}
