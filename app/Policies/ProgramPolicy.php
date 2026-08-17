<?php

namespace App\Policies;

use App\Models\Program;
use App\Models\User;

class ProgramPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasAnyRole(['admin', 'director', 'coordinator', 'secretary', 'teacher']);
    }

    public function view(User $user, Program $program): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $user->can('programs.manage');
    }

    public function update(User $user, Program $program): bool
    {
        return $user->can('programs.manage');
    }

    /**
     * Programs are never deleted — historical curricula and student
     * records must keep a stable reference. Deactivate via is_active
     * instead (see the dossier's historical-data rule, §26).
     */
    public function delete(User $user, Program $program): bool
    {
        return false;
    }
}
