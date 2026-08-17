<?php

namespace App\Policies;

use App\Models\CredentialRequirement;
use App\Models\User;

class CredentialRequirementPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasAnyRole(['director', 'coordinator', 'secretary']);
    }

    public function create(User $user): bool
    {
        return $user->hasAnyRole(['director', 'coordinator']);
    }

    public function update(User $user, CredentialRequirement $requirement): bool
    {
        return $user->hasAnyRole(['director', 'coordinator']);
    }

    /**
     * Deactivate via is_active instead — a past student's credential
     * checklist must keep referencing the same requirement row.
     */
    public function delete(User $user, CredentialRequirement $requirement): bool
    {
        return false;
    }
}
