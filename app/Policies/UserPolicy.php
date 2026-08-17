<?php

namespace App\Policies;

use App\Models\User;

class UserPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('accounts.manage');
    }

    public function view(User $user, User $model): bool
    {
        return $user->can('accounts.manage');
    }

    public function create(User $user): bool
    {
        return $user->can('accounts.manage');
    }

    public function update(User $user, User $model): bool
    {
        if (! $user->can('accounts.manage')) {
            return false;
        }

        // Only a super_admin may modify a super_admin or admin account —
        // enforced here, not just by hiding the option in the UI, so a
        // direct request against this route can't escalate privileges.
        if ($model->hasAnyRole(['super_admin', 'admin']) && ! $user->hasRole('super_admin')) {
            return false;
        }

        return true;
    }

    /**
     * Same escalation guard as update() — deactivating/reactivating an
     * account is still a privileged action against that account.
     */
    public function toggleActive(User $user, User $model): bool
    {
        if ($model->is($user)) {
            return false;
        }

        return $this->update($user, $model);
    }

    /**
     * Same escalation guard as update() again — issuing a new password
     * for someone else's account is equally privileged.
     */
    public function resetPassword(User $user, User $model): bool
    {
        return $this->update($user, $model);
    }

    /**
     * No account deletion in this milestone — deactivation/role changes
     * only. Revisit if the institution needs hard account removal.
     */
    public function delete(User $user, User $model): bool
    {
        return false;
    }
}
