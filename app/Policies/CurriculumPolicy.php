<?php

namespace App\Policies;

use App\Models\Curriculum;
use App\Models\User;

class CurriculumPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasAnyRole(['director', 'coordinator', 'secretary', 'teacher']);
    }

    public function view(User $user, Curriculum $curriculum): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $user->can('programs.manage');
    }

    public function update(User $user, Curriculum $curriculum): bool
    {
        return $user->can('programs.manage');
    }

    /**
     * Curricula are versioned and never deleted once created — students
     * enrolled under a version must keep a stable reference (dossier §26).
     * Deactivate via is_active instead of removing a version.
     */
    public function delete(User $user, Curriculum $curriculum): bool
    {
        return false;
    }
}
