<?php

namespace App\Policies;

use App\Models\StudentCredential;
use App\Models\User;

class StudentCredentialPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasAnyRole(['admin', 'director', 'coordinator', 'secretary']);
    }

    public function view(User $user, StudentCredential $credential): bool
    {
        return $this->viewAny($user);
    }

    public function verify(User $user, StudentCredential $credential): bool
    {
        return $user->can('credentials.verify');
    }

    /**
     * A verified document cannot be edited or deleted through the normal
     * path — only replaced via submitNewVersion(), which preserves the
     * prior version rather than destroying it (dossier §10).
     */
    public function delete(User $user, StudentCredential $credential): bool
    {
        return false;
    }
}
