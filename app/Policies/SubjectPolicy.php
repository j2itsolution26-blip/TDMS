<?php

namespace App\Policies;

use App\Models\Subject;
use App\Models\User;

class SubjectPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasAnyRole(['admin', 'director', 'coordinator', 'secretary', 'teacher']);
    }

    public function view(User $user, Subject $subject): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $user->can('subjects.manage');
    }

    public function update(User $user, Subject $subject): bool
    {
        return $user->can('subjects.manage');
    }

    /**
     * Deactivate via is_active instead — a subject already attached to a
     * curriculum is protected from deletion by the database's
     * restrictOnDelete constraint regardless (dossier §28).
     */
    public function delete(User $user, Subject $subject): bool
    {
        return false;
    }
}
