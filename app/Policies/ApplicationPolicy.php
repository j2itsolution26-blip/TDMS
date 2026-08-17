<?php

namespace App\Policies;

use App\Models\Application;
use App\Models\User;

class ApplicationPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasAnyRole(['admin', 'director', 'coordinator', 'secretary']);
    }

    public function view(User $user, Application $application): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $user->can('applications.review');
    }

    public function review(User $user, Application $application): bool
    {
        return $user->can('applications.review');
    }

    /**
     * Applications are never deleted — a returned application stays on
     * record with its reason (dossier §09 audit trail requirement).
     */
    public function delete(User $user, Application $application): bool
    {
        return false;
    }
}
